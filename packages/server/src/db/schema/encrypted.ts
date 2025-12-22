import { customType } from "drizzle-orm/pg-core";
import { decrypt, encrypt } from "../../utils/encryption";

/**
 * Custom Drizzle column type for encrypted text fields
 * Automatically encrypts data before storing and decrypts when retrieving
 */
export const encryptedText = customType<{
	data: string;
	notNull: false;
	default: false;
}>({
	dataType() {
		return "text";
	},
	toDriver(value: string): string {
		if (value === null || value === undefined) {
			return value;
		}
		// Encrypt before storing in database
		return encrypt(value);
	},
	fromDriver(value: unknown): string {
		if (value === null || value === undefined) {
			return value as string;
		}
		// Decrypt when retrieving from database
		return decrypt(value as string);
	},
});
