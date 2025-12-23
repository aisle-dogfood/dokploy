import type { IncomingMessage } from "node:http";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, apiKey, organization, twoFactor } from "better-auth/plugins";
import { and, desc, eq, sql } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import { getUserByToken } from "../services/admin";
import { updateUser } from "../services/user";
import { sendEmail } from "../verification/send-verification-email";
import { getPublicIpWithFallback } from "../wss/utils";

const { handler, api } = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	appName: "Dokploy",
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
	},
	...(!IS_CLOUD && {
		async trustedOrigins() {
			const admin = await db.query.member.findFirst({
				where: eq(schema.member.role, "owner"),
				with: {
					user: true,
				},
			});

			if (admin) {
				return [
					...(admin.user.serverIp
						? [`http://${admin.user.serverIp}:3000`]
						: []),
					...(admin.user.host ? [`https://${admin.user.host}`] : []),
				];
			}
			return [];
		},
	}),
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			if (IS_CLOUD) {
				await sendEmail({
					email: user.email,
					subject: "Verify your email",
					text: `
				<p>Click the link to verify your email: <a href="${url}">Verify Email</a></p>
				`,
				});
			}
		},
	},
	emailAndPassword: {
		enabled: true,
		autoSignIn: !IS_CLOUD,
		requireEmailVerification: IS_CLOUD,
		password: {
			async hash(password) {
				return bcrypt.hashSync(password, 10);
			},
			async verify({ hash, password }) {
				return bcrypt.compareSync(password, hash);
			},
		},
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				email: user.email,
				subject: "Reset your password",
				text: `
				<p>Click the link to reset your password: <a href="${url}">Reset Password</a></p>
				`,
			});
		},
	},
	databaseHooks: {
		user: {
			create: {
				before: async (_user, context) => {
					if (!IS_CLOUD) {
						const xDokployToken =
							context?.request?.headers?.get("x-dokploy-token");
						if (xDokployToken) {
							const user = await getUserByToken(xDokployToken);
							if (!user) {
								throw new APIError("BAD_REQUEST", {
									message: "User not found",
								});
							}
						} else {
							const isAdminPresent = await db.query.member.findFirst({
								where: eq(schema.member.role, "owner"),
							});
							if (isAdminPresent) {
								throw new APIError("BAD_REQUEST", {
									message: "Admin is already created",
								});
							}
						}
					}
				},
				after: async (user) => {
					const isAdminPresent = await db.query.member.findFirst({
						where: eq(schema.member.role, "owner"),
					});

					if (!IS_CLOUD) {
						await updateUser(user.id, {
							serverIp: await getPublicIpWithFallback(),
						});
					}

					if (IS_CLOUD || !isAdminPresent) {
						await db.transaction(async (tx) => {
							const organization = await tx
								.insert(schema.organization)
								.values({
									name: "My Organization",
									ownerId: user.id,
									createdAt: new Date(),
								})
								.returning()
								.then((res) => res[0]);

							await tx.insert(schema.member).values({
								userId: user.id,
								organizationId: organization?.id || "",
								role: "owner",
								createdAt: new Date(),
							});
						});
					}
				},
			},
		},
		session: {
			create: {
				before: async (session) => {
					const member = await db.query.member.findFirst({
						where: eq(schema.member.userId, session.userId),
						orderBy: desc(schema.member.createdAt),
						with: {
							organization: true,
						},
					});

					return {
						data: {
							...session,
							activeOrganizationId: member?.organization.id,
						},
					};
				},
			},
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 3,
		updateAge: 60 * 60 * 24,
	},
	user: {
		modelName: "users_temp",
		additionalFields: {
			role: {
				type: "string",
				// required: true,
				input: false,
			},
			ownerId: {
				type: "string",
				// required: true,
				input: false,
			},
			allowImpersonation: {
				fieldName: "allowImpersonation",
				type: "boolean",
				defaultValue: false,
			},
		},
	},
	plugins: [
		apiKey({
			enableMetadata: true,
		}),
		twoFactor(),
		organization({
			async sendInvitationEmail(data, _request) {
				if (IS_CLOUD) {
					const host =
						process.env.NODE_ENV === "development"
							? "http://localhost:3000"
							: "https://app.dokploy.com";
					const inviteLink = `${host}/invitation?token=${data.id}`;

					await sendEmail({
						email: data.email,
						subject: "Invitation to join organization",
						text: `
					<p>You are invited to join ${data.organization.name} on Dokploy. Click the link to accept the invitation: <a href="${inviteLink}">Accept Invitation</a></p>
					`,
					});
				}
			},
		}),
		...(IS_CLOUD
			? [
					admin({
						adminUserIds: [process.env.USER_ADMIN_ID as string],
					}),
				]
			: []),
	],
});

export const auth = {
	handler,
	createApiKey: api.createApiKey,
};

export const validateRequest = async (request: IncomingMessage) => {
	const apiKey = request.headers["x-api-key"] as string;
	if (apiKey) {
		try {
			const { valid, key, error } = await api.verifyApiKey({
				body: {
					key: apiKey,
				},
			});

			if (error) {
				throw new Error(error.message || "Error verifying API key");
			}
			if (!valid || !key) {
				return {
					session: null,
					user: null,
				};
			}

			const apiKeyRecord = await db.query.apikey.findFirst({
				where: eq(schema.apikey.id, key.id),
				with: {
					user: true,
				},
			});

			if (!apiKeyRecord) {
				return {
					session: null,
					user: null,
				};
			}

			// Check if API key is enabled
			if (apiKeyRecord.enabled === false) {
				console.warn(
					`API key ${apiKeyRecord.id} is disabled but attempted to be used`,
				);
				return {
					session: null,
					user: null,
				};
			}

			// Check if API key has expired
			if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
				console.warn(
					`API key ${apiKeyRecord.id} has expired at ${apiKeyRecord.expiresAt}`,
				);
				return {
					session: null,
					user: null,
				};
			}

			// Handle rate limiting if enabled
			if (apiKeyRecord.rateLimitEnabled) {
				const now = new Date();
				const currentRemaining = apiKeyRecord.remaining ?? 0;
				const maxRequests = apiKeyRecord.rateLimitMax ?? 0;
				const timeWindow = apiKeyRecord.rateLimitTimeWindow ?? 0; // in seconds
				const refillInterval = apiKeyRecord.refillInterval ?? 0; // in seconds
				const refillAmount = apiKeyRecord.refillAmount ?? 0;
				const lastRefillAt = apiKeyRecord.lastRefillAt ?? apiKeyRecord.createdAt;

				// Calculate if we need to refill based on refillInterval
				let newRemaining = currentRemaining;
				let newLastRefillAt = lastRefillAt;

				if (refillInterval > 0 && refillAmount > 0) {
					const timeSinceLastRefill = Math.floor(
						(now.getTime() - lastRefillAt.getTime()) / 1000,
					);
					const refillsNeeded = Math.floor(timeSinceLastRefill / refillInterval);

					if (refillsNeeded > 0) {
						// Refill the tokens
						newRemaining = Math.min(
							currentRemaining + refillsNeeded * refillAmount,
							maxRequests,
						);
						newLastRefillAt = new Date(
							lastRefillAt.getTime() + refillsNeeded * refillInterval * 1000,
						);
					}
				}

				// Check if request can be made
				if (newRemaining <= 0) {
					console.warn(
						`API key ${apiKeyRecord.id} has exceeded rate limit (0 requests remaining)`,
					);
					return {
						session: null,
						user: null,
					};
				}

				// Atomically update the counters in a transaction
				try {
					await db.transaction(async (tx) => {
						// Re-check the remaining count to prevent race conditions
						const currentKey = await tx.query.apikey.findFirst({
							where: eq(schema.apikey.id, key.id),
						});

						if (!currentKey) {
							throw new Error("API key not found in transaction");
						}

						let finalRemaining = currentKey.remaining ?? 0;
						let finalLastRefillAt = currentKey.lastRefillAt ?? currentKey.createdAt;

						// Recalculate refill in case it changed between queries
						if (refillInterval > 0 && refillAmount > 0) {
							const timeSinceLastRefill = Math.floor(
								(now.getTime() - finalLastRefillAt.getTime()) / 1000,
							);
							const refillsNeeded = Math.floor(
								timeSinceLastRefill / refillInterval,
							);

							if (refillsNeeded > 0) {
								finalRemaining = Math.min(
									finalRemaining + refillsNeeded * refillAmount,
									maxRequests,
								);
								finalLastRefillAt = new Date(
									finalLastRefillAt.getTime() +
										refillsNeeded * refillInterval * 1000,
								);
							}
						}

						// Check again if we have remaining requests
						if (finalRemaining <= 0) {
							throw new Error("Rate limit exceeded");
						}

						// Update counters: decrement remaining, increment request count, update timestamps
						await tx
							.update(schema.apikey)
							.set({
								remaining: sql`${schema.apikey.remaining} - 1`,
								requestCount: sql`${schema.apikey.requestCount} + 1`,
								lastRequest: now,
								lastRefillAt: finalLastRefillAt,
								updatedAt: now,
							})
							.where(eq(schema.apikey.id, key.id));
					});
				} catch (txError) {
					console.error("Error updating API key counters:", txError);
					// If transaction fails due to rate limit, reject the request
					if (
						txError instanceof Error &&
						txError.message === "Rate limit exceeded"
					) {
						return {
							session: null,
							user: null,
						};
					}
					throw txError;
				}
			} else {
				// Even if rate limiting is not enabled, track usage
				const now = new Date();
				await db
					.update(schema.apikey)
					.set({
						requestCount: sql`${schema.apikey.requestCount} + 1`,
						lastRequest: now,
						updatedAt: now,
					})
					.where(eq(schema.apikey.id, key.id));
			}

			const organizationId = JSON.parse(
				apiKeyRecord.metadata || "{}",
			).organizationId;

			if (!organizationId) {
				return {
					session: null,
					user: null,
				};
			}

			const member = await db.query.member.findFirst({
				where: and(
					eq(schema.member.userId, apiKeyRecord.user.id),
					eq(schema.member.organizationId, organizationId),
				),
				with: {
					organization: true,
				},
			});

			const {
				id,
				name,
				email,
				emailVerified,
				image,
				createdAt,
				updatedAt,
				twoFactorEnabled,
			} = apiKeyRecord.user;

			const mockSession = {
				session: {
					userId: apiKeyRecord.user.id,
					activeOrganizationId: organizationId || "",
				},
				user: {
					id,
					name,
					email,
					emailVerified,
					image,
					createdAt,
					updatedAt,
					twoFactorEnabled,
					role: member?.role || "member",
					ownerId: member?.organization.ownerId || apiKeyRecord.user.id,
				},
			};

			return mockSession;
		} catch (error) {
			console.error("Error verifying API key", error);
			return {
				session: null,
				user: null,
			};
		}
	}

	// If no API key, proceed with normal session validation
	const session = await api.getSession({
		headers: new Headers({
			cookie: request.headers.cookie || "",
		}),
	});

	if (!session?.session || !session.user) {
		return {
			session: null,
			user: null,
		};
	}

	if (session?.user) {
		const member = await db.query.member.findFirst({
			where: and(
				eq(schema.member.userId, session.user.id),
				eq(
					schema.member.organizationId,
					session.session.activeOrganizationId || "",
				),
			),
			with: {
				organization: true,
			},
		});

		session.user.role = member?.role || "member";
		if (member) {
			session.user.ownerId = member.organization.ownerId;
		} else {
			session.user.ownerId = session.user.id;
		}
	}

	return session;
};
