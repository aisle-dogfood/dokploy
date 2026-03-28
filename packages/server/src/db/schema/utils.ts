import { generatePassword } from "@dokploy/server/templates";
import { faker } from "@faker-js/faker";
import { customAlphabet } from "nanoid";
import crypto from "node:crypto";
import bcrypt from "bcrypt";

const alphabet = "abcdefghijklmnopqrstuvwxyz123456789";

const customNanoid = customAlphabet(alphabet, 6);

export const generateAppName = (type: string) => {
	const verb = faker.hacker.verb().replace(/ /g, "-");
	const adjective = faker.hacker.adjective().replace(/ /g, "-");
	const noun = faker.hacker.noun().replace(/ /g, "-");
	const randomFakerElement = `${verb}-${adjective}-${noun}`;
	const nanoidPart = customNanoid();
	return `${type}-${randomFakerElement}-${nanoidPart}`;
};

export const cleanAppName = (appName?: string) => {
	if (!appName) {
		return appName?.toLowerCase();
	}
	return appName.trim().replace(/ /g, "-").toLowerCase();
};

export const buildAppName = (type: string, baseAppName?: string) => {
	if (baseAppName) {
		return `${cleanAppName(baseAppName)}-${generatePassword(6)}`;
	}
	return generateAppName(type);
};

/**
 * Encryption and hashing utilities for sensitive data
 */

// Get encryption key from environment variable
const getEncryptionKey = (): Buffer => {
	const key = process.env.ENCRYPTION_KEY;
	if (!key) {
		throw new Error(
			"ENCRYPTION_KEY environment variable is not set. Please set a 32-byte hex-encoded key.",
		);
	}
	
	// Validate key length (must be 32 bytes = 64 hex characters)
	if (key.length !== 64) {
		throw new Error(
			"ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one using: openssl rand -hex 32",
		);
	}
	
	return Buffer.from(key, "hex");
};

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @returns Encrypted data in format: iv:authTag:ciphertext (all hex-encoded)
 */
export const encryptSecret = (plaintext: string): string => {
	if (!plaintext) {
		return plaintext;
	}

	try {
		const key = getEncryptionKey();
		const iv = crypto.randomBytes(16); // 16 bytes IV for AES-GCM
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

		let encrypted = cipher.update(plaintext, "utf8", "hex");
		encrypted += cipher.final("hex");

		const authTag = cipher.getAuthTag();

		// Return format: iv:authTag:ciphertext
		return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
	} catch (error) {
		throw new Error(
			`Failed to encrypt secret: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

/**
 * Decrypt sensitive data encrypted with AES-256-GCM
 * @param ciphertext - The encrypted data in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext
 */
export const decryptSecret = (ciphertext: string): string => {
	if (!ciphertext) {
		return ciphertext;
	}

	// Check if data is already in encrypted format (contains colons)
	if (!ciphertext.includes(":")) {
		// Data is not encrypted (legacy plaintext), return as-is
		return ciphertext;
	}

	try {
		const key = getEncryptionKey();
		const parts = ciphertext.split(":");

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
		throw new Error(
			`Failed to decrypt secret: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

/**
 * Hash a password using bcrypt
 * @param password - The plaintext password
 * @returns Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
	if (!password) {
		return password;
	}

	try {
		// Use cost factor of 12 for strong security
		const saltRounds = 12;
		return await bcrypt.hash(password, saltRounds);
	} catch (error) {
		throw new Error(
			`Failed to hash password: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

/**
 * Verify a password against a bcrypt hash
 * @param password - The plaintext password to verify
 * @param hash - The bcrypt hash to verify against
 * @returns True if password matches, false otherwise
 */
export const verifyPassword = async (
	password: string,
	hash: string,
): Promise<boolean> => {
	if (!password || !hash) {
		return false;
	}

	try {
		return await bcrypt.compare(password, hash);
	} catch (error) {
		throw new Error(
			`Failed to verify password: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
};

/**
 * Check if a string is a bcrypt hash
 * @param str - String to check
 * @returns True if string is a bcrypt hash
 */
export const isBcryptHash = (str: string): boolean => {
	if (!str) {
		return false;
	}
	// Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
	return /^\$2[aby]\$\d{2}\$.{53}$/.test(str);
};

/**
 * Check if a string is encrypted (in our encryption format)
 * @param str - String to check
 * @returns True if string is in encrypted format
 */
export const isEncrypted = (str: string): boolean => {
	if (!str) {
		return false;
	}
	// Our encrypted format is: iv:authTag:ciphertext (hex:hex:hex)
	const parts = str.split(":");
	if (parts.length !== 3) {
		return false;
	}
	// Check if all parts are valid hex
	return parts.every((part) => /^[0-9a-f]+$/i.test(part));
};
