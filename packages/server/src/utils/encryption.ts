import crypto from "node:crypto";

/**
 * Encryption utility for securing sensitive data at rest in the database
 * Uses AES-256-GCM encryption with authentication
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // AES block size
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

/**
 * Get encryption key from environment or generate a secure default
 * In production, ENCRYPTION_KEY should be set in environment variables
 */
function getEncryptionKey(): Buffer {
	const envKey = process.env.ENCRYPTION_KEY;

	if (!envKey) {
		console.warn(
			"WARNING: ENCRYPTION_KEY environment variable not set. Using insecure default. Set ENCRYPTION_KEY in production!",
		);
		// This is a fallback - in production this should always be set via environment
		return crypto.scryptSync("default-insecure-key", "salt", 32);
	}

	// Derive a 32-byte key from the environment variable using scrypt
	return crypto.scryptSync(envKey, "dokploy-encryption-salt", 32);
}

/**
 * Encrypt a string value
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: salt:iv:tag:encryptedData (all base64)
 */
export function encrypt(text: string): string {
	if (!text) {
		return text;
	}

	const key = getEncryptionKey();

	// Generate random salt and IV
	const salt = crypto.randomBytes(SALT_LENGTH);
	const iv = crypto.randomBytes(IV_LENGTH);

	// Create cipher
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	// Encrypt the text
	const encrypted = Buffer.concat([
		cipher.update(text, "utf8"),
		cipher.final(),
	]);

	// Get authentication tag
	const tag = cipher.getAuthTag();

	// Combine salt + iv + tag + encrypted data
	const result = Buffer.concat([salt, iv, tag, encrypted]);

	return result.toString("base64");
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - The encrypted text in format: salt:iv:tag:encryptedData (base64)
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedText: string): string {
	if (!encryptedText) {
		return encryptedText;
	}

	try {
		const key = getEncryptionKey();

		// Convert from base64
		const buffer = Buffer.from(encryptedText, "base64");

		// Extract components
		const salt = buffer.subarray(0, SALT_LENGTH);
		const iv = buffer.subarray(SALT_LENGTH, TAG_POSITION);
		const tag = buffer.subarray(TAG_POSITION, ENCRYPTED_POSITION);
		const encrypted = buffer.subarray(ENCRYPTED_POSITION);

		// Create decipher
		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);

		// Decrypt
		const decrypted = Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		]);

		return decrypted.toString("utf8");
	} catch (error) {
		console.error("Decryption error:", error);
		throw new Error("Failed to decrypt data. Data may be corrupted or key may be incorrect.");
	}
}

/**
 * Check if a value is encrypted (basic heuristic check)
 * @param value - The value to check
 * @returns true if the value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
	if (!value) {
		return false;
	}

	try {
		// Check if it's valid base64 and has minimum expected length
		const buffer = Buffer.from(value, "base64");
		const expectedMinLength = SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
		return buffer.length >= expectedMinLength;
	} catch {
		return false;
	}
}
