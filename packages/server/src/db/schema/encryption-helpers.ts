import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import * as bcrypt from "bcrypt";
import { decrypt, encrypt } from "../../utils/encryption";

/**
 * Custom Drizzle column type for encrypted text fields
 * Automatically encrypts on write and decrypts on read
 */
export const encryptedText = customType<{
	data: string;
	driverData: string;
}>({
	dataType() {
		return "text";
	},
	toDriver(value: string): string {
		if (!value) return value;
		return encrypt(value);
	},
	fromDriver(value: string): string {
		if (!value) return value;
		return decrypt(value);
	},
});

/**
 * Custom Drizzle column type for hashed password fields
 * Automatically hashes on write (one-way, cannot be decrypted)
 * Note: For reading, you should use bcrypt.compare() in your application logic
 */
export const hashedPassword = customType<{
	data: string;
	driverData: string;
}>({
	dataType() {
		return "text";
	},
	toDriver(value: string): string {
		if (!value) return value;
		// Only hash if it's not already a bcrypt hash (bcrypt hashes start with $2)
		if (value.startsWith("$2")) {
			return value;
		}
		return bcrypt.hashSync(value, 10);
	},
	fromDriver(value: string): string {
		// Return as-is for verification
		return value;
	},
});

/**
 * Helper function to verify a password against a hash
 */
export const verifyPassword = (
	password: string,
	hash: string,
): boolean => {
	return bcrypt.compareSync(password, hash);
};

/**
 * Helper to check if data is encrypted (our encrypted format)
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
 */
export const isBcryptHash = (value: string | null): boolean => {
	if (!value) return false;
	return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
};
