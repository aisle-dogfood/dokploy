import * as crypto from "node:crypto";

/**
 * Encryption utility for sensitive data
 * Uses AES-256-GCM for encryption/decryption
 */

// Get encryption key from environment or generate a warning
const getEncryptionKey = (): Buffer => {
	const key = process.env.ENCRYPTION_KEY;
	if (!key) {
		throw new Error(
			"ENCRYPTION_KEY environment variable is not set. Please set a 32-byte hex string for encryption.",
		);
	}

	// Key should be 32 bytes (64 hex characters)
	const keyBuffer = Buffer.from(key, "hex");
	if (keyBuffer.length !== 32) {
		throw new Error(
			"ENCRYPTION_KEY must be a 32-byte (64 character) hex string. Generate one using: openssl rand -hex 32",
		);
	}

	return keyBuffer;
};

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @returns Base64 encoded encrypted data with IV and auth tag
 */
export const encrypt = (plaintext: string): string => {
	if (!plaintext) {
		return "";
	}

	const key = getEncryptionKey();
	const iv = crypto.randomBytes(16); // 16 bytes IV for GCM
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

	let encrypted = cipher.update(plaintext, "utf8", "hex");
	encrypted += cipher.final("hex");

	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:encryptedData (all in hex)
	const result = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
	return Buffer.from(result).toString("base64");
};

/**
 * Decrypt data encrypted with the encrypt function
 * @param encryptedData - Base64 encoded encrypted data with IV and auth tag
 * @returns Decrypted plaintext
 */
export const decrypt = (encryptedData: string): string => {
	if (!encryptedData) {
		return "";
	}

	try {
		const key = getEncryptionKey();
		const decoded = Buffer.from(encryptedData, "base64").toString("utf8");
		const parts = decoded.split(":");

		if (parts.length !== 3) {
			throw new Error("Invalid encrypted data format");
		}

		const iv = Buffer.from(parts[0], "hex");
		const authTag = Buffer.from(parts[1], "hex");
		const encrypted = parts[2];

		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		throw new Error(`Decryption failed: ${error}`);
	}
};

/**
 * Hash sensitive tokens/API keys using SHA-256
 * This is one-way hashing - cannot be reversed
 * @param value - The value to hash
 * @returns Hex encoded hash
 */
export const hashToken = (value: string): string => {
	if (!value) {
		return "";
	}
	return crypto.createHash("sha256").update(value).digest("hex");
};

/**
 * Verify a token against a hash
 * @param value - The plain token value
 * @param hash - The hash to compare against
 * @returns true if the token matches the hash
 */
export const verifyTokenHash = (value: string, hash: string): boolean => {
	if (!value || !hash) {
		return false;
	}
	const valueHash = hashToken(value);
	return crypto.timingSafeEqual(Buffer.from(valueHash), Buffer.from(hash));
};

/**
 * Generate a random token
 * @param length - Length of the token in bytes (default 32)
 * @returns Hex encoded random token
 */
export const generateToken = (length = 32): string => {
	return crypto.randomBytes(length).toString("hex");
};

/**
 * Mask sensitive data for display (show first and last few characters)
 * @param value - The value to mask
 * @param showChars - Number of characters to show at start and end (default 4)
 * @returns Masked string
 */
export const maskSensitiveData = (
	value: string,
	showChars = 4,
): string => {
	if (!value || value.length <= showChars * 2) {
		return "***";
	}
	const start = value.substring(0, showChars);
	const end = value.substring(value.length - showChars);
	return `${start}${"*".repeat(Math.max(8, value.length - showChars * 2))}${end}`;
};

/**
 * Helper to check if data is encrypted (our encrypted format)
 * @param value - The value to check
 * @returns true if the value appears to be encrypted
 */
export const isEncrypted = (value: string | null): boolean => {
	if (!value) return false;
	try {
		// Our encrypted format is base64 encoded
		const decoded = Buffer.from(value, "base64").toString("utf8");
		const parts = decoded.split(":");
		return parts.length === 3;
	} catch {
		return false;
	}
};

/**
 * Helper to check if data is a bcrypt hash
 * @param value - The value to check
 * @returns true if the value appears to be a bcrypt hash
 */
export const isBcryptHash = (value: string | null): boolean => {
	if (!value) return false;
	return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
};
