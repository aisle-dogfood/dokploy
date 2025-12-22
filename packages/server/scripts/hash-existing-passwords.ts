/**
 * Migration script to hash existing plaintext passwords in the security table.
 * This should be run once after deploying the password hashing changes.
 * 
 * Run with: node --require esbuild-register packages/server/scripts/hash-existing-passwords.ts
 */

import { db } from "@dokploy/server/db";
import { security } from "@dokploy/server/db/schema";
import * as bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

async function hashExistingPasswords() {
	console.log("Starting migration to hash existing plaintext passwords...");

	try {
		// Get all security records
		const securityRecords = await db.query.security.findMany();
		
		console.log(`Found ${securityRecords.length} security records to process.`);

		let hashedCount = 0;
		let skippedCount = 0;

		for (const record of securityRecords) {
			// Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
			if (record.password.startsWith("$2a$") || 
			    record.password.startsWith("$2b$") || 
			    record.password.startsWith("$2y$")) {
				console.log(`Skipping record ${record.securityId} - password already hashed`);
				skippedCount++;
				continue;
			}

			// Hash the plaintext password
			const hashedPassword = await bcrypt.hash(record.password, 10);

			// Update the record with the hashed password
			await db
				.update(security)
				.set({ password: hashedPassword })
				.where(eq(security.securityId, record.securityId));

			console.log(`Hashed password for record ${record.securityId}`);
			hashedCount++;
		}

		console.log("\nMigration completed successfully!");
		console.log(`Total records processed: ${securityRecords.length}`);
		console.log(`Passwords hashed: ${hashedCount}`);
		console.log(`Already hashed (skipped): ${skippedCount}`);
	} catch (error) {
		console.error("Error during migration:", error);
		throw error;
	}
}

// Run the migration if this script is executed directly
if (require.main === module) {
	hashExistingPasswords()
		.then(() => {
			console.log("\nMigration script finished. Exiting...");
			process.exit(0);
		})
		.catch((error) => {
			console.error("\nMigration failed:", error);
			process.exit(1);
		});
}

export { hashExistingPasswords };
