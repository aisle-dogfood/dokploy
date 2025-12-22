import { customType } from "drizzle-orm/pg-core";
import { decrypt, encrypt } from "../../utils/encryption";

/**
 * Custom Drizzle column type for encrypted text fields
 * Automatically encrypts data on write and decrypts on read
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
		// Encrypt the value before storing in database
		return encrypt(value);
	},
	fromDriver(value: string): string {
		if (!value) return value;
		// Decrypt the value when reading from database
		return decrypt(value);
	},
});
