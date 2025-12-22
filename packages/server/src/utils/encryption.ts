import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Use ENCRYPTION_KEY from environment or generate a random one (for backward compatibility)
// In production, ENCRYPTION_KEY should be set as a 32-byte hex string
const getEncryptionKey = (): Buffer => {
	const envKey = process.env.ENCRYPTION_KEY;
	if (envKey) {
		// Convert hex string to buffer
		return Buffer.from(envKey, "hex");
	}
	
	// For backward compatibility and development, use a derived key
	// This is NOT secure for production use
	console.warn("WARNING: ENCRYPTION_KEY not set. Using derived key. Set ENCRYPTION_KEY environment variable for production.");
	const dbUrl = process.env.DATABASE_URL || "default-fallback-key";
	const crypto = require("node:crypto");
	return crypto.createHash("sha256").update(dbUrl).digest();
};

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

const getKey = (): Buffer => {
	if (!encryptionKey) {
		encryptionKey = getEncryptionKey();
	}
	return encryptionKey;
};

/**
 * Encrypts sensitive data using AES-256-GCM
 * Format: iv:authTag:encryptedData (all in hex)
 */
export function encrypt(text: string): string {
	if (!text) return text;
	
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv);
	
	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");
	
	const authTag = cipher.getAuthTag();
	
	// Combine iv, authTag, and encrypted data
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts data encrypted with the encrypt function
 */
export function decrypt(encryptedText: string): string {
	if (!encryptedText) return encryptedText;
	
	// Check if the text is already in encrypted format
	if (!encryptedText.includes(":")) {
		// Return as-is if not encrypted (for backward compatibility with existing plaintext data)
		return encryptedText;
	}
	
	try {
		const parts = encryptedText.split(":");
		if (parts.length !== 3) {
			// Not in our encrypted format, return as-is
			return encryptedText;
		}
		
		const iv = Buffer.from(parts[0], "hex");
		const authTag = Buffer.from(parts[1], "hex");
		const encrypted = parts[2];
		
		const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
		decipher.setAuthTag(authTag);
		
		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");
		
		return decrypted;
	} catch (error) {
		// If decryption fails, it might be plaintext from before encryption was implemented
		console.warn("Decryption failed, returning original value. This might be plaintext data.");
		return encryptedText;
	}
}

/**
 * Hash a session token using SHA-256
 * For session tokens, we use one-way hashing as we only need to verify, not retrieve
 */
export function hashToken(token: string): string {
	const crypto = require("node:crypto");
	return crypto.createHash("sha256").update(token).digest("hex");
}
