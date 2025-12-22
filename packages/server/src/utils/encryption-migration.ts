import { db } from "@dokploy/server/db";
import {
	ai,
	bitbucket,
	destinations,
	discord,
	email,
	gitea,
	github,
	gitlab,
	gotify,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
	registry,
	slack,
	telegram,
} from "@dokploy/server/db/schema";
import { sql } from "drizzle-orm";
import { encrypt } from "./encryption";

/**
 * Migration script to encrypt existing plaintext sensitive data
 * Run this once after setting up the ENCRYPTION_KEY environment variable
 */
export async function migrateEncryptSensitiveData() {
	if (!process.env.ENCRYPTION_KEY) {
		console.error(
			"ENCRYPTION_KEY is not set. Skipping encryption migration.",
		);
		return;
	}

	console.log("Starting encryption migration for sensitive data...");

	try {
		// Migrate registry passwords
		console.log("Encrypting registry passwords...");
		await db.execute(sql`
			UPDATE registry 
			SET password = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE password NOT LIKE '%:%:%'
		`);

		// Migrate email passwords
		console.log("Encrypting email passwords...");
		await db.execute(sql`
			UPDATE email 
			SET password = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE password NOT LIKE '%:%:%'
		`);

		// Migrate gotify app tokens
		console.log("Encrypting gotify app tokens...");
		await db.execute(sql`
			UPDATE gotify 
			SET "appToken" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "appToken" NOT LIKE '%:%:%'
		`);

		// Migrate telegram bot tokens
		console.log("Encrypting telegram bot tokens...");
		await db.execute(sql`
			UPDATE telegram 
			SET "botToken" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "botToken" NOT LIKE '%:%:%'
		`);

		// Migrate slack webhook URLs
		console.log("Encrypting slack webhook URLs...");
		await db.execute(sql`
			UPDATE slack 
			SET "webhookUrl" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "webhookUrl" NOT LIKE '%:%:%'
		`);

		// Migrate discord webhook URLs
		console.log("Encrypting discord webhook URLs...");
		await db.execute(sql`
			UPDATE discord 
			SET "webhookUrl" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "webhookUrl" NOT LIKE '%:%:%'
		`);

		// Migrate destination secret access keys
		console.log("Encrypting destination secret access keys...");
		await db.execute(sql`
			UPDATE destination 
			SET "secretAccessKey" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "secretAccessKey" NOT LIKE '%:%:%'
		`);

		// Migrate AI API keys
		console.log("Encrypting AI API keys...");
		await db.execute(sql`
			UPDATE ai 
			SET "apiKey" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "apiKey" NOT LIKE '%:%:%'
		`);

		// Migrate database passwords
		console.log("Encrypting database passwords...");

		await db.execute(sql`
			UPDATE postgres 
			SET "databasePassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "databasePassword" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE mysql 
			SET "databasePassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "databasePassword" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE mysql 
			SET "rootPassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "rootPassword" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE mariadb 
			SET "databasePassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "databasePassword" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE mariadb 
			SET "rootPassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "rootPassword" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE mongo 
			SET "databasePassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "databasePassword" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE redis 
			SET password = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE password NOT LIKE '%:%:%'
		`);

		// Migrate git provider secrets
		console.log("Encrypting git provider secrets...");

		await db.execute(sql`
			UPDATE github 
			SET "githubClientSecret" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "githubClientSecret" IS NOT NULL AND "githubClientSecret" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE github 
			SET "githubPrivateKey" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "githubPrivateKey" IS NOT NULL AND "githubPrivateKey" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE github 
			SET "githubWebhookSecret" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "githubWebhookSecret" IS NOT NULL AND "githubWebhookSecret" NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE gitlab 
			SET secret = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE secret IS NOT NULL AND secret NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE gitlab 
			SET access_token = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE access_token IS NOT NULL AND access_token NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE gitlab 
			SET refresh_token = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE refresh_token IS NOT NULL AND refresh_token NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE gitea 
			SET client_secret = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE client_secret IS NOT NULL AND client_secret NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE gitea 
			SET access_token = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE access_token IS NOT NULL AND access_token NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE gitea 
			SET refresh_token = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE refresh_token IS NOT NULL AND refresh_token NOT LIKE '%:%:%'
		`);

		await db.execute(sql`
			UPDATE bitbucket 
			SET "appPassword" = ${sql.raw(`'${encrypt("temp")}'`)}
			WHERE "appPassword" IS NOT NULL AND "appPassword" NOT LIKE '%:%:%'
		`);

		console.log("Encryption migration completed successfully!");
	} catch (error) {
		console.error("Error during encryption migration:", error);
		throw error;
	}
}

// Allow running this script directly
if (require.main === module) {
	migrateEncryptSensitiveData()
		.then(() => {
			console.log("Migration complete");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Migration failed:", error);
			process.exit(1);
		});
}
