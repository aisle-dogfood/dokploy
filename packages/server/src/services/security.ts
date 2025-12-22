import { db } from "@dokploy/server/db";
import { type apiCreateSecurity, security } from "@dokploy/server/db/schema";
import {
	createSecurityMiddleware,
	removeSecurityMiddleware,
	updateSecurityMiddleware,
} from "@dokploy/server/utils/traefik/security";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import * as bcrypt from "bcrypt";
import { findApplicationById } from "./application";
export type Security = typeof security.$inferSelect;

export const findSecurityById = async (securityId: string) => {
	const application = await db.query.security.findFirst({
		where: eq(security.securityId, securityId),
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Security not found",
		});
	}
	return application;
};

export const createSecurity = async (
	data: z.infer<typeof apiCreateSecurity>,
) => {
	try {
		await db.transaction(async (tx) => {
			const application = await findApplicationById(data.applicationId);

			// Hash the password before storing
			const hashedPassword = await bcrypt.hash(data.password, 10);

			const securityResponse = await tx
				.insert(security)
				.values({
					...data,
					password: hashedPassword,
				})
				.returning()
				.then((res) => res[0]);

			if (!securityResponse) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the security",
				});
			}
			await createSecurityMiddleware(application, securityResponse);
			return true;
		});
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating this security",
			cause: error,
		});
	}
};

export const deleteSecurityById = async (securityId: string) => {
	try {
		const result = await db
			.delete(security)
			.where(eq(security.securityId, securityId))
			.returning()
			.then((res) => res[0]);

		if (!result) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Security not found",
			});
		}

		const application = await findApplicationById(result.applicationId);

		await removeSecurityMiddleware(application, result);
		return result;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error removing this security";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};

export const updateSecurityById = async (
	securityId: string,
	data: Partial<Security>,
) => {
	try {
		// Get the old security data before updating
		const oldSecurity = await findSecurityById(securityId);
		const application = await findApplicationById(oldSecurity.applicationId);

		// If password is being updated, hash it
		// Only hash if it's a new password (not already a bcrypt hash)
		// bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 chars long
		let updateData = { ...data };
		if (data.password) {
			const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(data.password);
			if (!isBcryptHash) {
				updateData.password = await bcrypt.hash(data.password, 10);
			}
		}

		const response = await db
			.update(security)
			.set(updateData)
			.where(eq(security.securityId, securityId))
			.returning();

		const updatedSecurity = response[0];

		// Update Traefik middleware with the new credentials
		if (updatedSecurity) {
			await updateSecurityMiddleware(application, oldSecurity, updatedSecurity);
		}

		return updatedSecurity;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error updating this security";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};
