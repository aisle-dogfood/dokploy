import { db } from "@dokploy/server/db";
import { gotify } from "@dokploy/server/db/schema";
import { encrypt } from "@dokploy/server/utils/encryption";
import { eq } from "drizzle-orm";

/**
 * Migration script to encrypt existing plaintext Gotify appTokens
 * This should be run once during deployment to encrypt all existing tokens
 */
export async function encryptExistingGotifyTokens(): Promise<void> {
	console.log("Starting migration: Encrypting existing Gotify tokens...");

	try {
		// Get all Gotify records
		const allGotifyRecords = await db.query.gotify.findMany();

		if (allGotifyRecords.length === 0) {
			console.log("No Gotify records found. Migration complete.");
			return;
		}

		console.log(`Found ${allGotifyRecords.length} Gotify records to process.`);

		let encryptedCount = 0;
		let skippedCount = 0;

		for (const record of allGotifyRecords) {
			try {
				// Check if the token is already encrypted (contains the format: iv:authTag:encrypted)
				const isAlreadyEncrypted =
					record.appToken.includes(":") && record.appToken.split(":").length === 3;

				if (isAlreadyEncrypted) {
					console.log(
						`Token for Gotify ID ${record.gotifyId} appears to be already encrypted. Skipping.`,
					);
					skippedCount++;
					continue;
				}

				// Encrypt the plaintext token
				const encryptedToken = encrypt(record.appToken);

				// Update the record with the encrypted token
				await db
					.update(gotify)
					.set({ appToken: encryptedToken })
					.where(eq(gotify.gotifyId, record.gotifyId));

				console.log(`Successfully encrypted token for Gotify ID ${record.gotifyId}`);
				encryptedCount++;
			} catch (error) {
				console.error(
					`Error encrypting token for Gotify ID ${record.gotifyId}:`,
					error,
				);
				// Continue with other records even if one fails
			}
		}

		console.log(
			`Migration complete. Encrypted: ${encryptedCount}, Skipped: ${skippedCount}, Total: ${allGotifyRecords.length}`,
		);
	} catch (error) {
		console.error("Error during Gotify token encryption migration:", error);
		throw error;
	}
}

/**
 * Run this migration as a standalone script
 * Usage: node -r esbuild-register packages/server/src/utils/encrypt-existing-tokens.ts
 */
if (require.main === module) {
	encryptExistingGotifyTokens()
		.then(() => {
			console.log("Migration completed successfully");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Migration failed:", error);
			process.exit(1);
		});
}
