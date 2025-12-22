import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * OAuth state management utilities for secure CSRF protection.
 * 
 * The state parameter is constructed as: base64(nonce:giteaId:timestamp:hmac)
 * where hmac = HMAC-SHA256(nonce:giteaId:timestamp, secret)
 */

// State validity period (10 minutes)
const STATE_VALIDITY_MS = 10 * 60 * 1000;

/**
 * Derives a secret key for HMAC signing from environment variables.
 * Falls back to DATABASE_URL hash if no dedicated secret is configured.
 */
function getStateSecret(): string {
	// Prefer a dedicated OAuth state secret if configured
	if (process.env.OAUTH_STATE_SECRET) {
		return process.env.OAUTH_STATE_SECRET;
	}
	
	// Fallback: derive from DATABASE_URL (always available in dokploy)
	// This provides a stable, instance-specific secret
	const dbUrl = process.env.DATABASE_URL || "";
	return createHash("sha256").update(dbUrl).update("oauth-state-salt").digest("hex");
}

/**
 * Generates a cryptographically secure HMAC signature
 */
function generateHmac(data: string, secret: string): string {
	return createHash("sha256").update(data).update(secret).digest("hex");
}

/**
 * Generates a secure OAuth state parameter.
 * 
 * @param giteaId - The Gitea provider ID to bind to this state
 * @returns A signed, time-limited state token
 */
export function generateOAuthState(giteaId: string): string {
	// Generate cryptographically random nonce (16 bytes = 128 bits)
	const nonce = randomBytes(16).toString("hex");
	
	// Current timestamp for expiration checking
	const timestamp = Date.now().toString();
	
	// Construct the payload
	const payload = `${nonce}:${giteaId}:${timestamp}`;
	
	// Generate HMAC signature
	const secret = getStateSecret();
	const hmac = generateHmac(payload, secret);
	
	// Combine payload and signature
	const state = `${payload}:${hmac}`;
	
	// Base64 encode for URL safety
	return Buffer.from(state).toString("base64url");
}

/**
 * Validates and extracts the giteaId from an OAuth state parameter.
 * 
 * @param state - The state parameter received in the OAuth callback
 * @returns The giteaId if valid, null otherwise
 */
export function validateOAuthState(state: string): string | null {
	try {
		// Decode base64
		const decoded = Buffer.from(state, "base64url").toString("utf-8");
		
		// Parse components
		const parts = decoded.split(":");
		if (parts.length !== 4) {
			console.error("Invalid state format: incorrect number of parts");
			return null;
		}
		
		const [nonce, giteaId, timestamp, receivedHmac] = parts;
		
		// Validate timestamp (prevent replay attacks)
		const stateAge = Date.now() - Number.parseInt(timestamp, 10);
		if (stateAge > STATE_VALIDITY_MS) {
			console.error("State expired: age =", stateAge, "ms");
			return null;
		}
		
		if (stateAge < 0) {
			console.error("State timestamp is in the future");
			return null;
		}
		
		// Reconstruct the payload and verify HMAC
		const payload = `${nonce}:${giteaId}:${timestamp}`;
		const secret = getStateSecret();
		const expectedHmac = generateHmac(payload, secret);
		
		// Constant-time comparison to prevent timing attacks
		const receivedHmacBuffer = Buffer.from(receivedHmac, "hex");
		const expectedHmacBuffer = Buffer.from(expectedHmac, "hex");
		
		if (receivedHmacBuffer.length !== expectedHmacBuffer.length) {
			console.error("HMAC length mismatch");
			return null;
		}
		
		if (!timingSafeEqual(receivedHmacBuffer, expectedHmacBuffer)) {
			console.error("HMAC verification failed");
			return null;
		}
		
		// State is valid, return the giteaId
		return giteaId;
	} catch (error) {
		console.error("Error validating OAuth state:", error);
		return null;
	}
}
