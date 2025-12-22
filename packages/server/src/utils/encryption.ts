import crypto from "node:crypto";

// Encryption configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Get the encryption key from environment variable
 * This should be a 32-byte key encoded as base64 or hex
 */
function getEncryptionKey(): string {
	const key =
		process.env.ENCRYPTION_KEY || process.env.SECRET_KEY || process.env.SECRET;

	if (!key) {
		throw new Error(
			"ENCRYPTION_KEY environment variable is not set. Please set it to a secure random string.",
		);
	}

	return key;
}

/**
 * Derive a cryptographic key from the master key and salt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
	return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha512");
}

/**
 * Encrypt a string value using AES-256-GCM
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: salt:iv:tag:ciphertext (all base64 encoded)
 */
export function encrypt(plaintext: string): string {
	if (!plaintext) {
		return plaintext;
	}

	try {
		const masterKey = getEncryptionKey();
		const salt = crypto.randomBytes(SALT_LENGTH);
		const key = deriveKey(masterKey, salt);
		const iv = crypto.randomBytes(IV_LENGTH);

		const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

		let encrypted = cipher.update(plaintext, "utf8", "base64");
		encrypted += cipher.final("base64");

		const tag = cipher.getAuthTag();

		// Return format: salt:iv:tag:ciphertext
		return `${salt.toString("base64")}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted}`;
	} catch (error) {
		console.error("Encryption error:", error);
		throw new Error("Failed to encrypt data");
	}
}

/**
 * Decrypt a string value that was encrypted with the encrypt function
 * @param encryptedData - Encrypted string in format: salt:iv:tag:ciphertext
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedData: string): string {
	if (!encryptedData) {
		return encryptedData;
	}

	// Check if the data is in the encrypted format
	const parts = encryptedData.split(":");
	if (parts.length !== 4) {
		// Data is not encrypted (legacy plaintext), return as-is
		// This allows for gradual migration from plaintext to encrypted
		console.warn(
			"Attempting to decrypt data that appears to be in plaintext format. Consider re-encrypting.",
		);
		return encryptedData;
	}

	try {
		const masterKey = getEncryptionKey();
		const [saltB64, ivB64, tagB64, encrypted] = parts;

		const salt = Buffer.from(saltB64, "base64");
		const iv = Buffer.from(ivB64, "base64");
		const tag = Buffer.from(tagB64, "base64");
		const key = deriveKey(masterKey, salt);

		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);

		let decrypted = decipher.update(encrypted, "base64", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		console.error("Decryption error:", error);
		throw new Error("Failed to decrypt data");
	}
}

/**
 * Check if a value is encrypted
 * @param value - The value to check
 * @returns true if the value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
	if (!value) {
		return false;
	}
	const parts = value.split(":");
	return parts.length === 4;
}

/**
 * Re-encrypt data (useful when rotating encryption keys)
 * @param encryptedData - Currently encrypted data
 * @param oldKey - Old encryption key
 * @returns Re-encrypted data with new key
 */
export function reencrypt(encryptedData: string): string {
	const plaintext = decrypt(encryptedData);
	return encrypt(plaintext);
}
