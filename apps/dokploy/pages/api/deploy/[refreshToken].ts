import { db } from "@/server/db";
import { applications } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { IS_CLOUD, shouldDeploy } from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 requests per minute per token
const MAX_FAILED_ATTEMPTS = 5; // Max 5 failed attempts per IP per window

// In-memory rate limiting stores
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const failedAttempts = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();

// Clean up old entries periodically (every 5 minutes)
setInterval(() => {
	const now = Date.now();
	for (const [key, value] of requestCounts.entries()) {
		if (now > value.resetTime) {
			requestCounts.delete(key);
		}
	}
	for (const [key, value] of failedAttempts.entries()) {
		if (now > value.resetTime && (!value.blockedUntil || now > value.blockedUntil)) {
			failedAttempts.delete(key);
		}
	}
}, 5 * 60 * 1000);

/**
 * Check if request should be rate limited
 */
function checkRateLimit(identifier: string): boolean {
	const now = Date.now();
	const record = requestCounts.get(identifier);

	if (!record || now > record.resetTime) {
		requestCounts.set(identifier, {
			count: 1,
			resetTime: now + RATE_LIMIT_WINDOW_MS,
		});
		return true;
	}

	if (record.count >= MAX_REQUESTS_PER_WINDOW) {
		return false;
	}

	record.count++;
	return true;
}

/**
 * Track failed authentication attempts and implement temporary blocking
 */
function trackFailedAttempt(ip: string): boolean {
	const now = Date.now();
	const record = failedAttempts.get(ip);

	if (!record || now > record.resetTime) {
		failedAttempts.set(ip, {
			count: 1,
			resetTime: now + RATE_LIMIT_WINDOW_MS,
		});
		return true;
	}

	// Check if IP is currently blocked
	if (record.blockedUntil && now < record.blockedUntil) {
		return false;
	}

	record.count++;

	// Block IP if too many failed attempts
	if (record.count >= MAX_FAILED_ATTEMPTS) {
		record.blockedUntil = now + (15 * 60 * 1000); // Block for 15 minutes
		console.warn(`[Security] IP ${ip} blocked due to excessive failed authentication attempts`);
		return false;
	}

	return true;
}

/**
 * Validate that the request comes from a known provider
 */
function validateProviderHeaders(headers: NextApiRequest["headers"]): boolean {
	const validProviderHeaders = [
		"x-github-event",
		"x-gitlab-event", 
		"x-gitea-event",
		"x-event-key", // Bitbucket
	];

	// Check for known provider headers
	const hasProviderHeader = validProviderHeaders.some(header => headers[header]);
	
	// Docker Hub uses Go-http-client user agent
	const isDockerHub = headers["user-agent"]?.includes("Go-http-client");

	return hasProviderHeader || isDockerHub;
}

/**
 * Timing-safe token comparison to prevent timing attacks
 */
function timingSafeTokenCompare(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Get client IP address
 */
function getClientIp(req: NextApiRequest): string {
	const forwarded = req.headers["x-forwarded-for"];
	const ip = forwarded 
		? (typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0])
		: req.socket.remoteAddress || "unknown";
	return ip;
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { refreshToken } = req.query;
	const clientIp = getClientIp(req);

	try {
		// Validate that refreshToken is provided
		if (!refreshToken || typeof refreshToken !== "string") {
			console.warn(`[Security] Webhook request missing refreshToken from IP: ${clientIp}`);
			res.status(400).json({ message: "Invalid request" });
			return;
		}

		// Check for ping events early
		if (req.headers["x-github-event"] === "ping") {
			res.status(200).json({ message: "Ping received, webhook is active" });
			return;
		}

		// Validate provider headers to ensure request is from a known source
		if (!validateProviderHeaders(req.headers)) {
			console.warn(`[Security] Webhook request from IP ${clientIp} missing expected provider headers`);
			trackFailedAttempt(clientIp);
			res.status(403).json({ 
				message: "Request must include valid provider headers (GitHub, GitLab, Gitea, Bitbucket, or Docker Hub)" 
			});
			return;
		}

		// Check if IP is blocked due to failed attempts
		const ipBlocked = failedAttempts.get(clientIp);
		if (ipBlocked?.blockedUntil && Date.now() < ipBlocked.blockedUntil) {
			console.warn(`[Security] Blocked webhook request from IP: ${clientIp} (too many failed attempts)`);
			res.status(429).json({ message: "Too many failed attempts. Please try again later." });
			return;
		}

		// Rate limit by token
		if (!checkRateLimit(refreshToken)) {
			console.warn(`[Security] Rate limit exceeded for token: ${refreshToken.substring(0, 8)}... from IP: ${clientIp}`);
			res.status(429).json({ message: "Rate limit exceeded. Please try again later." });
			return;
		}

		// Rate limit by IP
		if (!checkRateLimit(`ip:${clientIp}`)) {
			console.warn(`[Security] Rate limit exceeded for IP: ${clientIp}`);
			res.status(429).json({ message: "Rate limit exceeded. Please try again later." });
			return;
		}

		const application = await db.query.applications.findFirst({
			where: eq(applications.refreshToken, refreshToken as string),
			with: {
				project: true,
				bitbucket: true,
			},
		});

		if (!application) {
			console.warn(`[Security] Invalid webhook token attempt from IP: ${clientIp}`);
			trackFailedAttempt(clientIp);
			res.status(404).json({ message: "Application Not Found" });
			return;
		}

		// Verify token using timing-safe comparison
		if (!timingSafeTokenCompare(application.refreshToken || "", refreshToken)) {
			console.warn(`[Security] Token mismatch for application ${application.applicationId} from IP: ${clientIp}`);
			trackFailedAttempt(clientIp);
			res.status(404).json({ message: "Application Not Found" });
			return;
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

			// Log successful webhook deployment for monitoring
			const provider = getProviderByHeader(req.headers) || "unknown";
			console.log(
				`[Security] Webhook deployment triggered: ` +
				`application=${application.applicationId}, ` +
				`provider=${provider}, ` +
				`ip=${clientIp}, ` +
				`branch=${extractBranchName(req.headers, req.body) || "N/A"}`
			);

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
			console.error(`[Security] Deployment error for application ${application.applicationId} from IP ${clientIp}:`, error);
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
