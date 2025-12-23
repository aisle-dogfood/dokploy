import type { Context, Next } from "hono";
import { logger } from "./logger.js";

// Rate limiting configuration
interface RateLimitConfig {
	windowMs: number; // Time window in milliseconds
	maxRequests: number; // Maximum requests per window
}

interface RateLimitEntry {
	count: number;
	resetTime: number;
}

interface FailedAttempt {
	count: number;
	lastAttempt: number;
	backoffUntil: number;
}

// In-memory stores (for production, consider using Redis)
const ipRateLimits = new Map<string, RateLimitEntry>();
const keyRateLimits = new Map<string, RateLimitEntry>();
const failedAttempts = new Map<string, FailedAttempt>();

// Configuration
const IP_RATE_LIMIT: RateLimitConfig = {
	windowMs: 60 * 1000, // 1 minute
	maxRequests: 100, // 100 requests per minute per IP
};

const KEY_RATE_LIMIT: RateLimitConfig = {
	windowMs: 60 * 1000, // 1 minute
	maxRequests: 200, // 200 requests per minute per key
};

// Maximum failed authentication attempts before applying backoff
const MAX_FAILED_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1000; // 1 second base backoff

/**
 * Get client IP address from request
 */
function getClientIp(c: Context): string {
	// Check common headers for proxy/load balancer setups
	const forwarded = c.req.header("x-forwarded-for");
	const realIp = c.req.header("x-real-ip");
	const cfConnectingIp = c.req.header("cf-connecting-ip");

	if (cfConnectingIp) return cfConnectingIp;
	if (realIp) return realIp;
	if (forwarded) return forwarded.split(",")[0].trim();

	// Fallback to connection remote address
	return "unknown";
}

/**
 * Check if IP is in allow list
 */
function isIpAllowed(ip: string): boolean {
	const allowList = process.env.IP_ALLOW_LIST;
	if (!allowList) {
		// If no allow list is configured, allow all IPs
		return true;
	}

	const allowedIps = allowList.split(",").map((ip) => ip.trim());
	return allowedIps.includes(ip);
}

/**
 * Check rate limit for a given key
 */
function checkRateLimit(
	store: Map<string, RateLimitEntry>,
	key: string,
	config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetTime: number } {
	const now = Date.now();
	const entry = store.get(key);

	if (!entry || now > entry.resetTime) {
		// Create new entry
		const resetTime = now + config.windowMs;
		store.set(key, { count: 1, resetTime });
		return { allowed: true, remaining: config.maxRequests - 1, resetTime };
	}

	if (entry.count >= config.maxRequests) {
		// Rate limit exceeded
		return {
			allowed: false,
			remaining: 0,
			resetTime: entry.resetTime,
		};
	}

	// Increment count
	entry.count++;
	store.set(key, entry);

	return {
		allowed: true,
		remaining: config.maxRequests - entry.count,
		resetTime: entry.resetTime,
	};
}

/**
 * Calculate exponential backoff time
 */
function calculateBackoff(attempts: number): number {
	// Exponential backoff: 2^(attempts-1) * base, capped at 5 minutes
	const backoffMs = Math.min(
		Math.pow(2, attempts - 1) * BACKOFF_BASE_MS,
		5 * 60 * 1000,
	);
	return backoffMs;
}

/**
 * Record failed authentication attempt
 */
function recordFailedAttempt(ip: string): number {
	const now = Date.now();
	const attempt = failedAttempts.get(ip);

	if (!attempt || now > attempt.backoffUntil) {
		// First attempt or backoff expired
		const newAttempt: FailedAttempt = {
			count: 1,
			lastAttempt: now,
			backoffUntil: 0,
		};
		failedAttempts.set(ip, newAttempt);
		return 0;
	}

	// Increment attempt count
	attempt.count++;
	attempt.lastAttempt = now;

	if (attempt.count >= MAX_FAILED_ATTEMPTS) {
		// Apply exponential backoff
		const backoffMs = calculateBackoff(attempt.count - MAX_FAILED_ATTEMPTS + 1);
		attempt.backoffUntil = now + backoffMs;
		failedAttempts.set(ip, attempt);

		logger.warn(
			{
				ip,
				attempts: attempt.count,
				backoffMs,
			},
			"Rate limiting IP due to repeated failed authentication attempts",
		);

		return backoffMs;
	}

	failedAttempts.set(ip, attempt);
	return 0;
}

/**
 * Clear failed attempts for an IP (on successful auth)
 */
function clearFailedAttempts(ip: string): void {
	failedAttempts.delete(ip);
}

/**
 * Check if IP is currently in backoff period
 */
function isInBackoff(ip: string): { inBackoff: boolean; backoffMs: number } {
	const now = Date.now();
	const attempt = failedAttempts.get(ip);

	if (!attempt) {
		return { inBackoff: false, backoffMs: 0 };
	}

	if (now < attempt.backoffUntil) {
		return {
			inBackoff: true,
			backoffMs: attempt.backoffUntil - now,
		};
	}

	return { inBackoff: false, backoffMs: 0 };
}

/**
 * Audit log for API key usage
 */
function auditLog(c: Context, authenticated: boolean, reason?: string): void {
	const ip = getClientIp(c);
	const path = c.req.path;
	const method = c.req.method;
	const userAgent = c.req.header("user-agent") || "unknown";

	logger.info(
		{
			event: "api_key_validation",
			authenticated,
			ip,
			method,
			path,
			userAgent,
			reason,
			timestamp: new Date().toISOString(),
		},
		`API authentication ${authenticated ? "succeeded" : "failed"}`,
	);
}

/**
 * Security middleware with rate limiting, IP allow-listing, and audit logging
 */
export async function securityMiddleware(c: Context, next: Next) {
	// Skip security checks for health endpoint
	if (c.req.path === "/health") {
		return next();
	}

	const ip = getClientIp(c);

	// Check IP allow list
	if (!isIpAllowed(ip)) {
		auditLog(c, false, "IP not in allow list");
		logger.warn({ ip }, "Request from IP not in allow list");
		return c.json({ message: "Access denied" }, 403);
	}

	// Check if IP is in backoff period
	const backoffStatus = isInBackoff(ip);
	if (backoffStatus.inBackoff) {
		auditLog(c, false, "IP in backoff period");
		logger.warn(
			{ ip, backoffMs: backoffStatus.backoffMs },
			"Request blocked due to backoff period",
		);
		return c.json(
			{
				message: "Too many failed attempts. Please try again later.",
				retryAfter: Math.ceil(backoffStatus.backoffMs / 1000),
			},
			429,
		);
	}

	// Check IP rate limit
	const ipLimit = checkRateLimit(ipRateLimits, ip, IP_RATE_LIMIT);
	if (!ipLimit.allowed) {
		auditLog(c, false, "IP rate limit exceeded");
		logger.warn({ ip }, "IP rate limit exceeded");
		return c.json(
			{
				message: "Rate limit exceeded",
				retryAfter: Math.ceil((ipLimit.resetTime - Date.now()) / 1000),
			},
			429,
		);
	}

	// Validate API key
	const authHeader = c.req.header("X-API-Key");

	if (!authHeader) {
		recordFailedAttempt(ip);
		auditLog(c, false, "Missing API key");
		return c.json({ message: "Invalid API Key" }, 403);
	}

	if (process.env.API_KEY !== authHeader) {
		recordFailedAttempt(ip);
		auditLog(c, false, "Invalid API key");
		return c.json({ message: "Invalid API Key" }, 403);
	}

	// Check API key rate limit
	const keyLimit = checkRateLimit(keyRateLimits, authHeader, KEY_RATE_LIMIT);
	if (!keyLimit.allowed) {
		auditLog(c, false, "API key rate limit exceeded");
		logger.warn({ keyPrefix: authHeader.substring(0, 8) }, "API key rate limit exceeded");
		return c.json(
			{
				message: "Rate limit exceeded",
				retryAfter: Math.ceil((keyLimit.resetTime - Date.now()) / 1000),
			},
			429,
		);
	}

	// Authentication successful
	clearFailedAttempts(ip);
	auditLog(c, true);

	// Set rate limit headers
	c.header("X-RateLimit-Limit", String(KEY_RATE_LIMIT.maxRequests));
	c.header("X-RateLimit-Remaining", String(keyLimit.remaining));
	c.header(
		"X-RateLimit-Reset",
		String(Math.ceil(keyLimit.resetTime / 1000)),
	);

	return next();
}

/**
 * Cleanup expired entries periodically
 */
export function startCleanupTask() {
	setInterval(() => {
		const now = Date.now();

		// Cleanup IP rate limits
		for (const [key, entry] of ipRateLimits.entries()) {
			if (now > entry.resetTime) {
				ipRateLimits.delete(key);
			}
		}

		// Cleanup key rate limits
		for (const [key, entry] of keyRateLimits.entries()) {
			if (now > entry.resetTime) {
				keyRateLimits.delete(key);
			}
		}

		// Cleanup failed attempts
		for (const [key, attempt] of failedAttempts.entries()) {
			if (now > attempt.backoffUntil && now - attempt.lastAttempt > 3600000) {
				// Clean up if backoff expired and last attempt was over 1 hour ago
				failedAttempts.delete(key);
			}
		}
	}, 60000); // Run every minute
}
