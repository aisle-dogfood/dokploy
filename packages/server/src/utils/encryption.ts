import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { customType } from "drizzle-orm/pg-core";

/**
 * Encryption key from environment variable.
 * This must be a 32-byte (256-bit) hex string for AES-256-GCM.
 * Generate with: openssl rand -hex 32
 */
const getEncryptionKey = (): Buffer => {
	const key = process.env.ENCRYPTION_KEY;
	if (!key) {
		throw new Error(
			"ENCRYPTION_KEY environment variable is not set. Generate one with: openssl rand -hex 32",
		);
	}
	if (key.length !== 64) {
		throw new Error(
			"ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32",
		);
	}
	return Buffer.from(key, "hex");
};

/**
 * Encrypts a string using AES-256-GCM (authenticated encryption)
 * Returns a string in format: iv:authTag:encryptedData (all hex encoded)
 */
export const encrypt = (text: string): string => {
	if (!text) {
		return "";
	}

	try {
		const key = getEncryptionKey();
		// Generate a random 12-byte IV (recommended for GCM)
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", key, iv);

		let encrypted = cipher.update(text, "utf8", "hex");
		encrypted += cipher.final("hex");

		// Get the authentication tag
		const authTag = cipher.getAuthTag();

		// Return iv:authTag:encrypted (all in hex)
		return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
	} catch (error) {
		console.error("Encryption error:", error);
		throw new Error("Failed to encrypt data");
	}
};

/**
 * Decrypts a string that was encrypted with the encrypt function
 * Expects format: iv:authTag:encryptedData (all hex encoded)
 */
export const decrypt = (encryptedText: string): string => {
	if (!encryptedText) {
		return "";
	}

	try {
		const key = getEncryptionKey();
		const parts = encryptedText.split(":");
		if (parts.length !== 3) {
			throw new Error("Invalid encrypted data format");
		}

		const [ivHex, authTagHex, encrypted] = parts;
		const iv = Buffer.from(ivHex, "hex");
		const authTag = Buffer.from(authTagHex, "hex");

		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		return decrypted;
	} catch (error) {
		console.error("Decryption error:", error);
		throw new Error("Failed to decrypt data");
	}
};

/**
 * Custom Drizzle ORM column type for encrypted text fields
 * Automatically encrypts data on insert/update and decrypts on select
 */
export const encryptedText = () =>
	customType<{ data: string; driverData: string }>({
		dataType() {
			return "text";
		},
		toDriver(value: string): string {
			return encrypt(value);
		},
		fromDriver(value: string): string {
			return decrypt(value);
		},
	})();

/**
 * Optional encrypted text field (allows null/undefined)
 */
export const encryptedTextOptional = () =>
	customType<{ data: string | null; driverData: string | null }>({
		dataType() {
			return "text";
		},
		toDriver(value: string | null): string | null {
			if (value === null || value === undefined) {
				return null;
			}
			return encrypt(value);
		},
		fromDriver(value: string | null): string | null {
			if (value === null || value === undefined) {
				return null;
			}
			return decrypt(value);
		},
	})();
