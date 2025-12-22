import crypto from "node:crypto";
import { Webhooks } from "@octokit/webhooks";

/**
 * Rate limiting store for webhook requests
 * In production, consider using Redis or a database-backed solution
 */
interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per token

/**
 * Clean up old rate limit entries periodically
 */
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore.entries()) {
		if (entry.resetAt < now) {
			rateLimitStore.delete(key);
		}
	}
}, RATE_LIMIT_WINDOW);

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier for the rate limit (e.g., refreshToken + IP)
 * @returns true if rate limit is exceeded, false otherwise
 */
export function isRateLimited(identifier: string): boolean {
	const now = Date.now();
	const entry = rateLimitStore.get(identifier);

	if (!entry || entry.resetAt < now) {
		// First request or window expired, create new entry
		rateLimitStore.set(identifier, {
			count: 1,
			resetAt: now + RATE_LIMIT_WINDOW,
		});
		return false;
	}

	if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
		return true;
	}

	entry.count++;
	return false;
}

/**
 * Verify GitHub webhook signature using HMAC SHA-256
 * @param payload - Request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - GitHub webhook secret
 * @returns true if signature is valid, false otherwise
 */
export async function verifyGithubSignature(
	payload: string,
	signature: string | undefined,
	secret: string,
): Promise<boolean> {
	if (!signature) {
		return false;
	}

	try {
		const webhooks = new Webhooks({ secret });
		return await webhooks.verify(payload, signature);
	} catch (error) {
		console.error("GitHub signature verification error:", error);
		return false;
	}
}

/**
 * Verify GitLab webhook token
 * @param token - X-Gitlab-Token header value
 * @param expectedToken - Expected GitLab webhook secret token
 * @returns true if token matches, false otherwise
 */
export function verifyGitlabToken(
	token: string | undefined,
	expectedToken: string,
): boolean {
	if (!token || !expectedToken) {
		return false;
	}

	// Use timing-safe comparison to prevent timing attacks
	try {
		const tokenBuffer = Buffer.from(token);
		const expectedBuffer = Buffer.from(expectedToken);

		if (tokenBuffer.length !== expectedBuffer.length) {
			return false;
		}

		return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
	} catch (error) {
		console.error("GitLab token verification error:", error);
		return false;
	}
}

/**
 * Verify Gitea webhook signature using HMAC SHA-256
 * @param payload - Request body as string
 * @param signature - X-Gitea-Signature header value
 * @param secret - Gitea webhook secret
 * @returns true if signature is valid, false otherwise
 */
export function verifyGiteaSignature(
	payload: string,
	signature: string | undefined,
	secret: string,
): boolean {
	if (!signature || !secret) {
		return false;
	}

	try {
		const hmac = crypto.createHmac("sha256", secret);
		hmac.update(payload);
		const expectedSignature = hmac.digest("hex");

		const signatureBuffer = Buffer.from(signature);
		const expectedBuffer = Buffer.from(expectedSignature);

		if (signatureBuffer.length !== expectedBuffer.length) {
			return false;
		}

		return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
	} catch (error) {
		console.error("Gitea signature verification error:", error);
		return false;
	}
}

/**
 * Check if an IP address is in the allowed list
 * @param ip - Client IP address
 * @param allowedIps - Array of allowed IP addresses or CIDR ranges (optional)
 * @returns true if IP is allowed or no IP filtering is configured, false otherwise
 */
export function isIpAllowed(
	ip: string | undefined,
	allowedIps?: string[],
): boolean {
	// If no IP filtering is configured, allow all
	if (!allowedIps || allowedIps.length === 0) {
		return true;
	}

	if (!ip) {
		return false;
	}

	// Simple exact match for now
	// In production, consider implementing CIDR range matching
	return allowedIps.includes(ip);
}

/**
 * Get client IP address from request
 * @param req - Next.js API request object
 * @returns Client IP address
 */
export function getClientIp(req: any): string {
	// Check for common proxy headers
	const forwarded = req.headers["x-forwarded-for"];
	if (forwarded) {
		const ips = forwarded.split(",");
		return ips[0].trim();
	}

	const realIp = req.headers["x-real-ip"];
	if (realIp) {
		return realIp;
	}

	return req.socket?.remoteAddress || "unknown";
}
