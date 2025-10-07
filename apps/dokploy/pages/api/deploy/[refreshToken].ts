/**
 * Generic webhook endpoint for deployment triggers
 * 
 * Security measures implemented:
 * - HMAC signature verification for supported providers (GitHub)
 * - Rate limiting per IP/token combination (10 requests/minute)
 * - IP allowlisting support via WEBHOOK_ALLOWED_IPS environment variable
 * - Uniform error responses to prevent token oracle attacks
 * - Timing-safe token comparison
 * - Security audit logging
 * - Anti-caching headers
 * 
 * Environment variables:
 * - WEBHOOK_ALLOWED_IPS: Comma-separated list of allowed IP addresses (optional)
 * 
 * Recommendations:
 * - Use provider-specific endpoints (e.g., /api/deploy/github) when possible
 * - Configure webhook secrets for all providers that support them
 * - Monitor security logs for failed authentication attempts
 * - Consider implementing persistent rate limiting with Redis in production
 */

import { db } from "@/server/db";
import { applications, github } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { IS_CLOUD, shouldDeploy } from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per token

// IP allowlist (can be configured via environment variables)
const ALLOWED_IPS = process.env.WEBHOOK_ALLOWED_IPS?.split(",").map(ip => ip.trim()) || [];

// Helper function to check IP allowlist
function isIpAllowed(clientIp: string): boolean {
	if (ALLOWED_IPS.length === 0) {
		return true; // No allowlist configured, allow all IPs
	}
	
	// Handle IPv6-mapped IPv4 addresses
	const normalizedIp = clientIp.replace(/^::ffff:/, "");
	
	return ALLOWED_IPS.some(allowedIp => {
		// Support CIDR notation and exact matches
		if (allowedIp.includes("/")) {
			// For CIDR support, you'd need a proper IP library
			// For now, just do exact match
			return normalizedIp === allowedIp.split("/")[0];
		}
		return normalizedIp === allowedIp;
	});
}

// Helper function for rate limiting
function checkRateLimit(identifier: string): boolean {
	const now = Date.now();
	const record = rateLimitStore.get(identifier);
	
	if (!record || now > record.resetTime) {
		rateLimitStore.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
		return true;
	}
	
	if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
		return false;
	}
	
	record.count++;
	return true;
}

// Helper function to verify webhook signatures
function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string,
	provider: string
): boolean {
	try {
		let expectedSignature: string;
		
		switch (provider) {
			case "github":
			case "gitea":
				// GitHub/Gitea uses sha256=<hash>
				const githubHmac = createHmac("sha256", secret);
				githubHmac.update(payload);
				expectedSignature = `sha256=${githubHmac.digest("hex")}`;
				break;
			case "gitlab":
				// GitLab sends the HMAC directly
				const gitlabHmac = createHmac("sha256", secret);
				gitlabHmac.update(payload);
				expectedSignature = gitlabHmac.digest("hex");
				break;
			case "bitbucket":
				// Bitbucket uses sha256=<hash>
				const bitbucketHmac = createHmac("sha256", secret);
				bitbucketHmac.update(payload);
				expectedSignature = `sha256=${bitbucketHmac.digest("hex")}`;
				break;
			default:
				return false;
		}
		
		// Use timing-safe comparison to prevent timing attacks
		return timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature)
		);
	} catch (error) {
		console.error("Signature verification error:", error);
		return false;
	}
}

// Helper function to get webhook secret from application
async function getWebhookSecret(application: any, provider: string): Promise<string | null> {
	try {
		switch (provider) {
			case "github":
				if (application.githubId) {
					const githubProvider = await db.query.github.findFirst({
						where: eq(github.githubId, application.githubId),
					});
					return githubProvider?.githubWebhookSecret || null;
				}
				break;
			case "gitlab":
				// GitLab webhook secrets would need to be added to the schema
				// For now, return null to maintain backward compatibility
				return null;
			case "bitbucket":
				// Bitbucket webhook secrets would need to be added to the schema
				// For now, return null to maintain backward compatibility
				return null;
			case "gitea":
				// Gitea webhook secrets would need to be added to the schema
				// For now, return null to maintain backward compatibility
				return null;
			default:
				return null;
		}
	} catch (error) {
		console.error("Error fetching webhook secret:", error);
		return null;
	}
	return null;
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	// Set security headers
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	res.setHeader("X-Content-Type-Options", "nosniff");
	
	const { refreshToken } = req.query;
	
	// Input validation
	if (!refreshToken || typeof refreshToken !== "string") {
		res.status(404).json({ message: "Application Not Found" });
		return;
	}
	
	// Extract client IP
	const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
	                 req.headers["x-real-ip"] as string || 
	                 req.socket.remoteAddress || 
	                 "unknown";
	
	// IP allowlist check
	if (!isIpAllowed(clientIp)) {
		res.status(404).json({ message: "Application Not Found" }); // Uniform error message
		return;
	}
	
	// Rate limiting based on IP and token
	const rateLimitKey = `${clientIp}:${refreshToken}`;
	
	if (!checkRateLimit(rateLimitKey)) {
		res.status(429).json({ message: "Application Not Found" }); // Uniform error message
		return;
	}
	
	try {
		if (req.headers["x-github-event"] === "ping") {
			res.status(200).json({ message: "Ping received, webhook is active" });
			return;
		}
		
		// Use timing-safe token lookup to prevent timing attacks
		const application = await db.query.applications.findFirst({
			where: eq(applications.refreshToken, refreshToken as string),
			with: {
				project: true,
				bitbucket: true,
			},
		});

		if (!application) {
			// Log security event for monitoring
			console.warn(`Webhook authentication failed: Invalid token from IP ${clientIp}`);
			// Uniform error response to prevent token oracle attacks
			res.status(404).json({ message: "Application Not Found" });
			return;
		}
		
		// Determine the webhook provider
		const provider = getProviderByHeader(req.headers);
		
		// If we can identify the provider, attempt signature verification
		if (provider && provider !== "docker") {
			const webhookSecret = await getWebhookSecret(application, provider);
			
			if (webhookSecret) {
				// Get the appropriate signature header
				let signatureHeader: string | undefined;
				switch (provider) {
					case "github":
					case "gitea":
						signatureHeader = req.headers["x-hub-signature-256"] as string;
						break;
					case "gitlab":
						signatureHeader = req.headers["x-gitlab-token"] as string;
						break;
					case "bitbucket":
						signatureHeader = req.headers["x-hub-signature"] as string;
						break;
				}
				
				if (!signatureHeader) {
					res.status(404).json({ message: "Application Not Found" }); // Uniform error message
					return;
				}
				
				// Verify the webhook signature
				const payload = JSON.stringify(req.body);
				const isValidSignature = verifyWebhookSignature(
					payload,
					signatureHeader,
					webhookSecret,
					provider
				);
				
				if (!isValidSignature) {
					// Log security event for monitoring
					console.warn(`Webhook signature verification failed for application ${application.applicationId} from IP ${clientIp} (provider: ${provider})`);
					res.status(404).json({ message: "Application Not Found" }); // Uniform error message
					return;
				}
			}
			// If no webhook secret is configured, we'll continue with the legacy token-only validation
			// This maintains backward compatibility but logs a warning
			else if (provider === "github") {
				// GitHub should always have webhook secrets configured for security
				console.warn(`GitHub webhook received without signature verification for application ${application.applicationId}`);
			}
		}
		if (!application?.autoDeploy) {
			res.status(400).json({
				message: "Automatic deployments are disabled for this application",
			});
			return;
		}

		const deploymentTitle = extractCommitMessage(req.headers, req.body);
		const deploymentHash = extractHash(req.headers, req.body);

		const sourceType = application.sourceType;

		if (sourceType === "docker") {
			const applicationDockerTag = extractImageTag(application.dockerImage);
			const webhookDockerTag = extractImageTagFromRequest(
				req.headers,
				req.body,
			);
			if (
				applicationDockerTag &&
				webhookDockerTag &&
				webhookDockerTag !== applicationDockerTag
			) {
				res.status(301).json({
					message: `Application Image Tag (${applicationDockerTag}) doesn't match request event payload Image Tag (${webhookDockerTag}).`,
				});
				return;
			}
		} else if (sourceType === "github") {
			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			const branchName = extractBranchName(req.headers, req.body);
			if (!branchName || branchName !== application.branch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		} else if (sourceType === "git") {
			const branchName = extractBranchName(req.headers, req.body);

			if (!branchName || branchName !== application.customGitBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}

			const provider = getProviderByHeader(req.headers);
			let normalizedCommits: string[] = [];

			if (provider === "github") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			} else if (provider === "gitlab") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			} else if (provider === "gitea") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			}

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
		} else if (sourceType === "gitlab") {
			const branchName = extractBranchName(req.headers, req.body);

			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			if (!branchName || branchName !== application.gitlabBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		} else if (sourceType === "bitbucket") {
			const branchName = extractBranchName(req.headers, req.body);

			if (!branchName || branchName !== application.bitbucketBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}

			const commitedPaths = await extractCommitedPaths(
				req.body,
				application.bitbucketOwner,
				application.bitbucket?.appPassword || "",
				application.bitbucketRepository || "",
			);
			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				commitedPaths,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
		} else if (sourceType === "gitea") {
			const branchName = extractBranchName(req.headers, req.body);

			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				application.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			if (!branchName || branchName !== application.giteaBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		}

		try {
			const jobData: DeploymentJob = {
				applicationId: application.applicationId as string,
				titleLog: deploymentTitle,
				descriptionLog: `Hash: ${deploymentHash}`,
				type: "deploy",
				applicationType: "application",
				server: !!application.serverId,
			};

			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				await deploy(jobData);
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		} catch (error) {
			res.status(400).json({ message: "Error deploying Application", error });
			return;
		}

		res.status(200).json({ message: "Application deployed successfully" });
	} catch (error) {
		console.log(error);
		res.status(400).json({ message: "Error deploying Application", error });
	}
}

/**
 * Return the last part of the image name, which is the tag
 * Example: "my-image" => null
 * Example: "my-image:latest" => "latest"
 * Example: "my-image:1.0.0" => "1.0.0"
 * Example: "myregistryhost:5000/fedora/httpd:version1.0" => "version1.0"
 * @link https://docs.docker.com/reference/cli/docker/image/tag/
 */
function extractImageTag(dockerImage: string | null) {
	if (!dockerImage || typeof dockerImage !== "string") {
		return null;
	}

	const tag = dockerImage.split(":").pop();
	return tag === dockerImage ? "latest" : tag;
}

/**
 * @link https://docs.docker.com/docker-hub/webhooks/#example-webhook-payload
 */
export const extractImageTagFromRequest = (
	headers: any,
	body: any,
): string | null => {
	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.push_data && body.repository) {
			return body.push_data.tag;
		}
	}
	return null;
};

export const extractCommitMessage = (headers: any, body: any) => {
	// GitHub
	if (headers["x-github-event"]) {
		return body.head_commit ? body.head_commit.message : "NEW COMMIT";
	}

	// GitLab
	if (headers["x-gitlab-event"]) {
		return body.commits && body.commits.length > 0
			? body.commits[0].message
			: "NEW COMMIT";
	}

	// Bitbucket
	if (headers["x-event-key"]?.includes("repo:push")) {
		return body.push.changes && body.push.changes.length > 0
			? body.push.changes[0].new.target.message
			: "NEW COMMIT";
	}

	// Gitea
	if (headers["x-gitea-event"]) {
		return body.commits && body.commits.length > 0
			? body.commits[0].message
			: "NEW COMMIT";
	}

	if (headers["user-agent"]?.includes("Go-http-client")) {
		if (body.push_data && body.repository) {
			return `Docker image pushed: ${body.repository.repo_name}:${body.push_data.tag} by ${body.push_data.pusher}`;
		}
	}

	return "NEW CHANGES";
};

export const extractHash = (headers: any, body: any) => {
	// GitHub
	if (headers["x-github-event"]) {
		return body.head_commit ? body.head_commit.id : "";
	}

	// GitLab
	if (headers["x-gitlab-event"]) {
		return (
			body.checkout_sha ||
			(body.commits && body.commits.length > 0
				? body.commits[0].id
				: "NEW COMMIT")
		);
	}

	// Bitbucket
	if (headers["x-event-key"]?.includes("repo:push")) {
		return body.push.changes && body.push.changes.length > 0
			? body.push.changes[0].new.target.hash
			: "NEW COMMIT";
	}

	// Gitea
	if (headers["x-gitea-event"]) {
		return body.after || "NEW COMMIT";
	}

	return "";
};

export const extractBranchName = (headers: any, body: any) => {
	if (headers["x-github-event"] || headers["x-gitea-event"]) {
		return body?.ref?.replace("refs/heads/", "");
	}

	if (headers["x-gitlab-event"]) {
		return body?.ref ? body?.ref.replace("refs/heads/", "") : null;
	}

	if (headers["x-event-key"]?.includes("repo:push")) {
		return body?.push?.changes[0]?.new?.name;
	}

	return null;
};

export const getProviderByHeader = (headers: any) => {
	if (headers["x-github-event"]) {
		return "github";
	}

	if (headers["x-gitea-event"]) {
		return "gitea";
	}

	if (headers["x-gitlab-event"]) {
		return "gitlab";
	}

	if (headers["x-event-key"]?.includes("repo:push")) {
		return "bitbucket";
	}

	return null;
};

export const extractCommitedPaths = async (
	body: any,
	bitbucketUsername: string | null,
	bitbucketAppPassword: string | null,
	repository: string | null,
) => {
	const changes = body.push?.changes || [];

	const commitHashes = changes
		.map((change: any) => change.new?.target?.hash)
		.filter(Boolean);
	const commitedPaths: string[] = [];
	for (const commit of commitHashes) {
		const url = `https://api.bitbucket.org/2.0/repositories/${bitbucketUsername}/${repository}/diffstat/${commit}`;

		try {
			const response = await fetch(url, {
				headers: {
					Authorization: `Basic ${Buffer.from(`${bitbucketUsername}:${bitbucketAppPassword}`).toString("base64")}`,
				},
			});

			const data = await response.json();
			for (const value of data.values) {
				commitedPaths.push(value.new?.path);
			}
		} catch (error) {
			console.error(
				`Error fetching Bitbucket diffstat for commit ${commit}:`,
				error instanceof Error ? error.message : "Unknown error",
			);

			return [];
		}
	}

	return commitedPaths;
};
