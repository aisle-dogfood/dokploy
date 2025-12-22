import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption key should be 32 bytes for AES-256
// This should be set in environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

if (!ENCRYPTION_KEY) {
	console.warn(
		"WARNING: ENCRYPTION_KEY is not set. Sensitive data will not be encrypted. Please set ENCRYPTION_KEY environment variable.",
	);
}

// Derive a 32-byte key from the environment variable
function getEncryptionKey(): Buffer {
	if (!ENCRYPTION_KEY) {
		// If no key is set, return a zero buffer (fallback for backward compatibility)
		// In production, this should throw an error
		return Buffer.alloc(32);
	}

	// Hash the key to ensure it's exactly 32 bytes
	const crypto = require("node:crypto");
	return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

/**
 * Encrypts a string using AES-256-GCM
 * Returns base64 encoded string in format: iv:authTag:encryptedData
 */
export function encrypt(plaintext: string): string {
	if (!plaintext) {
		return plaintext;
	}

	// If encryption key is not set, return plaintext for backward compatibility
	// This allows the application to still function while migration is in progress
	if (!ENCRYPTION_KEY) {
		return plaintext;
	}

	const iv = randomBytes(16); // GCM standard IV length
	const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);

	let encrypted = cipher.update(plaintext, "utf8", "base64");
	encrypted += cipher.final("base64");

	const authTag = cipher.getAuthTag();

	// Store as iv:authTag:encryptedData
	return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with the encrypt function
 */
export function decrypt(ciphertext: string): string {
	if (!ciphertext) {
		return ciphertext;
	}

	// If encryption key is not set, assume data is not encrypted (backward compatibility)
	if (!ENCRYPTION_KEY) {
		return ciphertext;
	}

	// Check if the data is in encrypted format (contains colons)
	if (!ciphertext.includes(":")) {
		// Data is not encrypted, return as-is (for backward compatibility during migration)
		return ciphertext;
	}

	try {
		const parts = ciphertext.split(":");
		if (parts.length !== 3) {
			// Invalid format, return as-is
			return ciphertext;
		}

		const [ivBase64, authTagBase64, encryptedData] = parts;
		const iv = Buffer.from(ivBase64, "base64");
		const authTag = Buffer.from(authTagBase64, "base64");

		const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encryptedData, "base64", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		// If decryption fails, the data might not be encrypted
		// Return as-is for backward compatibility
		console.error("Decryption failed, returning original value:", error);
		return ciphertext;
	}
}

/**
 * Masks a sensitive string for display purposes
 * Shows only first and last 4 characters
 */
export function maskSecret(secret: string): string {
	if (!secret || secret.length <= 8) {
		return "********";
	}
	return `${secret.substring(0, 4)}${"*".repeat(secret.length - 8)}${secret.substring(secret.length - 4)}`;
}
