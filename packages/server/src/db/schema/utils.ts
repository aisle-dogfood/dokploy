import { generatePassword } from "@dokploy/server/templates";
import { decrypt, encrypt } from "@dokploy/server/utils/encryption";
import { faker } from "@faker-js/faker";
import { customType } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

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
 * Custom Drizzle column type for encrypted text fields
 * Automatically encrypts data before storing and decrypts when reading
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
