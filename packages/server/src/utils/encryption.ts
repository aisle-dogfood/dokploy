import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption utility for sensitive data stored in the database
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // For AES, this is always 16
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment or generate a warning
 */
function getEncryptionKey(): Buffer {
	const key = process.env.ENCRYPTION_KEY;

	if (!key) {
		console.warn(
			"WARNING: ENCRYPTION_KEY environment variable is not set. Using a default key. THIS IS INSECURE FOR PRODUCTION!",
		);
		// Return a deterministic key for development/migration purposes
		// In production, this should throw an error
		return Buffer.from("0".repeat(64), "hex");
	}

	// Key should be a 64-character hex string (32 bytes)
	if (key.length !== 64) {
		throw new Error(
			"ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)",
		);
	}

	try {
		return Buffer.from(key, "hex");
	} catch (error) {
		throw new Error("ENCRYPTION_KEY must be a valid hexadecimal string");
	}
}

/**
 * Encrypt a string value using AES-256-GCM
 * Returns: iv:authTag:encryptedData (all in hex)
 */
export function encrypt(text: string): string {
	if (!text) {
		return text;
	}

	try {
		const key = getEncryptionKey();
		const iv = randomBytes(IV_LENGTH);
		const cipher = createCipheriv(ALGORITHM, key, iv);

		let encrypted = cipher.update(text, "utf8", "hex");
		encrypted += cipher.final("hex");

		const authTag = cipher.getAuthTag();

		// Format: iv:authTag:encryptedData
		return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
	} catch (error) {
		console.error("Encryption error:", error);
		throw new Error("Failed to encrypt data");
	}
}

/**
 * Decrypt a string value encrypted with AES-256-GCM
 * Expects format: iv:authTag:encryptedData (all in hex)
 */
export function decrypt(encryptedData: string): string {
	if (!encryptedData) {
		return encryptedData;
	}

	try {
		// Check if data is in encrypted format (contains colons)
		if (!encryptedData.includes(":")) {
			// Data is not encrypted (backward compatibility or migration scenario)
			// Return as-is but log a warning
			console.warn(
				"Attempting to decrypt data that appears to be unencrypted. Returning as-is.",
			);
			return encryptedData;
		}

		const parts = encryptedData.split(":");
		if (parts.length !== 3) {
			// Invalid format, might be legacy data
			console.warn(
				"Invalid encrypted data format. Expected iv:authTag:data. Returning as-is.",
			);
			return encryptedData;
		}

		const [ivHex, authTagHex, encrypted] = parts;

		const key = getEncryptionKey();
		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");

		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		// If decryption fails, it might be unencrypted legacy data
		// Log the error and return the original data
		console.error("Decryption error (might be legacy unencrypted data):", error);
		return encryptedData;
	}
}

/**
 * Generate a new encryption key (for setup/initialization)
 */
export function generateEncryptionKey(): string {
	return randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Check if a string appears to be encrypted
 */
export function isEncrypted(data: string): boolean {
	if (!data) return false;
	const parts = data.split(":");
	return parts.length === 3 && parts.every((part) => /^[0-9a-f]+$/i.test(part));
}
