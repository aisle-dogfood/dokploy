import { customType } from "drizzle-orm/pg-core";
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
