import * as crypto from "node:crypto";

/**
 * Encryption utility for sensitive data using AES-256-GCM
 * This provides authenticated encryption with additional data integrity
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // GCM standard IV length
const AUTH_TAG_LENGTH = 16; // GCM standard auth tag length
const SALT_LENGTH = 32; // For key derivation

/**
 * Get the encryption key from environment variable
 * If not set, generates a key (WARNING: data encrypted with generated key won't be decryptable after restart)
 */
function getEncryptionKey(): Buffer {
	const envKey = process.env.ENCRYPTION_KEY;
	
	if (!envKey) {
		console.warn(
			"WARNING: ENCRYPTION_KEY environment variable is not set. " +
			"Using a temporary key. Data encrypted with this key will not be decryptable after application restart. " +
			"Please set ENCRYPTION_KEY in your environment variables for production use."
		);
		// Generate a temporary key (32 bytes for AES-256)
		return crypto.randomBytes(32);
	}

	// Derive a proper 32-byte key from the environment variable
	return crypto.scryptSync(envKey, "dokploy-salt", 32);
}

// Cache the encryption key
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
	if (!cachedKey) {
		cachedKey = getEncryptionKey();
	}
	return cachedKey;
}

/**
 * Encrypts sensitive data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @returns Encrypted data in format: iv:authTag:encrypted
 */
export function encrypt(plaintext: string): string {
	if (!plaintext) {
		return plaintext;
	}

	try {
		const key = getKey();
		const iv = crypto.randomBytes(IV_LENGTH);
		const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

		let encrypted = cipher.update(plaintext, "utf8", "hex");
		encrypted += cipher.final("hex");

		const authTag = cipher.getAuthTag();

		// Combine iv, authTag, and encrypted data
		// Format: iv:authTag:encrypted
		return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
	} catch (error) {
		console.error("Encryption error:", error);
		throw new Error("Failed to encrypt sensitive data");
	}
}

/**
 * Decrypts data encrypted with the encrypt function
 * @param ciphertext - The encrypted data in format: iv:authTag:encrypted
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string): string {
	if (!ciphertext) {
		return ciphertext;
	}

	try {
		// Check if the data is already in encrypted format
		const parts = ciphertext.split(":");
		if (parts.length !== 3) {
			// Data might not be encrypted yet (for backwards compatibility during migration)
			// Return as-is and log a warning
			console.warn("Data does not appear to be encrypted, returning as-is");
			return ciphertext;
		}

		const [ivHex, authTagHex, encrypted] = parts;

		const key = getKey();
		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");

		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		console.error("Decryption error:", error);
		throw new Error("Failed to decrypt sensitive data");
	}
}

/**
 * Masks a token for safe display in logs and API responses
 * Shows only first and last 4 characters
 * @param token - The token to mask
 * @returns Masked token (e.g., "abcd****xyz")
 */
export function maskToken(token: string): string {
	if (!token || token.length <= 8) {
		return "****";
	}
	return `${token.substring(0, 4)}${"*".repeat(token.length - 8)}${token.substring(token.length - 4)}`;
}
