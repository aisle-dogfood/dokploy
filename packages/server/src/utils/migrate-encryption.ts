/**
 * Migration script to encrypt existing plaintext sensitive data
 * 
 * WARNING: This script should be run ONCE during the upgrade process
 * 
 * Before running:
 * 1. BACKUP YOUR DATABASE
 * 2. Set the ENCRYPTION_KEY environment variable
 * 3. Test in a non-production environment first
 * 
 * Usage:
 *   node -r esbuild-register src/utils/migrate-encryption.ts
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import {
	applications,
	bitbucket,
	certificates,
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
	sshKeys,
	telegram,
} from "../db/schema";
import { encrypt } from "./encryption";

interface MigrationResult {
	table: string;
	recordsProcessed: number;
	errors: string[];
}

/**
 * Check if a value is already encrypted (matches the format iv:authTag:data)
 */
function isEncrypted(value: string | null | undefined): boolean {
	if (!value) return true; // null/undefined/empty values don't need encryption
	// Check if it matches the encrypted format (3 parts separated by colons)
	const parts = value.split(":");
	return parts.length === 3 && /^[0-9a-f]+$/i.test(parts.join(""));
}

/**
 * Safely encrypt a value, skipping if already encrypted
 */
function safeEncrypt(value: string | null | undefined): string | null {
	if (!value) return null;
	if (isEncrypted(value)) {
		console.log("  Value already encrypted, skipping");
		return value;
	}
	return encrypt(value);
}

async function migrateCertificates(): Promise<MigrationResult> {
	console.log("\n📜 Migrating certificates...");
	const result: MigrationResult = {
		table: "certificate",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.certificates.findMany();
		console.log(`  Found ${records.length} certificates`);

		for (const record of records) {
			try {
				const updates: Record<string, string> = {};

				if (!isEncrypted(record.certificateData)) {
					updates.certificateData = encrypt(record.certificateData);
				}
				if (!isEncrypted(record.privateKey)) {
					updates.privateKey = encrypt(record.privateKey);
				}

				if (Object.keys(updates).length > 0) {
					await db
						.update(certificates)
						.set(updates)
						.where(eq(certificates.certificateId, record.certificateId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`Certificate ${record.certificateId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query certificates: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateSshKeys(): Promise<MigrationResult> {
	console.log("\n🔑 Migrating SSH keys...");
	const result: MigrationResult = {
		table: "ssh-key",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.sshKeys.findMany();
		console.log(`  Found ${records.length} SSH keys`);

		for (const record of records) {
			try {
				if (record.privateKey && !isEncrypted(record.privateKey)) {
					await db
						.update(sshKeys)
						.set({ privateKey: encrypt(record.privateKey) })
						.where(eq(sshKeys.sshKeyId, record.sshKeyId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`SSH Key ${record.sshKeyId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query SSH keys: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateRegistries(): Promise<MigrationResult> {
	console.log("\n🐳 Migrating registries...");
	const result: MigrationResult = {
		table: "registry",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.registry.findMany();
		console.log(`  Found ${records.length} registries`);

		for (const record of records) {
			try {
				if (!isEncrypted(record.password)) {
					await db
						.update(registry)
						.set({ password: encrypt(record.password) })
						.where(eq(registry.registryId, record.registryId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`Registry ${record.registryId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query registries: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateGithub(): Promise<MigrationResult> {
	console.log("\n🐙 Migrating GitHub providers...");
	const result: MigrationResult = {
		table: "github",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.github.findMany();
		console.log(`  Found ${records.length} GitHub providers`);

		for (const record of records) {
			try {
				const updates: Record<string, string | null> = {};

				if (record.githubClientSecret && !isEncrypted(record.githubClientSecret)) {
					updates.githubClientSecret = encrypt(record.githubClientSecret);
				}
				if (record.githubPrivateKey && !isEncrypted(record.githubPrivateKey)) {
					updates.githubPrivateKey = encrypt(record.githubPrivateKey);
				}
				if (
					record.githubWebhookSecret &&
					!isEncrypted(record.githubWebhookSecret)
				) {
					updates.githubWebhookSecret = encrypt(record.githubWebhookSecret);
				}

				if (Object.keys(updates).length > 0) {
					await db
						.update(github)
						.set(updates)
						.where(eq(github.githubId, record.githubId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`GitHub ${record.githubId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query GitHub providers: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateGitlab(): Promise<MigrationResult> {
	console.log("\n🦊 Migrating GitLab providers...");
	const result: MigrationResult = {
		table: "gitlab",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.gitlab.findMany();
		console.log(`  Found ${records.length} GitLab providers`);

		for (const record of records) {
			try {
				const updates: Record<string, string | null> = {};

				if (record.secret && !isEncrypted(record.secret)) {
					updates.secret = encrypt(record.secret);
				}
				if (record.accessToken && !isEncrypted(record.accessToken)) {
					updates.accessToken = encrypt(record.accessToken);
				}
				if (record.refreshToken && !isEncrypted(record.refreshToken)) {
					updates.refreshToken = encrypt(record.refreshToken);
				}

				if (Object.keys(updates).length > 0) {
					await db
						.update(gitlab)
						.set(updates)
						.where(eq(gitlab.gitlabId, record.gitlabId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`GitLab ${record.gitlabId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query GitLab providers: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateGitea(): Promise<MigrationResult> {
	console.log("\n🍵 Migrating Gitea providers...");
	const result: MigrationResult = {
		table: "gitea",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.gitea.findMany();
		console.log(`  Found ${records.length} Gitea providers`);

		for (const record of records) {
			try {
				const updates: Record<string, string | null> = {};

				if (record.clientSecret && !isEncrypted(record.clientSecret)) {
					updates.clientSecret = encrypt(record.clientSecret);
				}
				if (record.accessToken && !isEncrypted(record.accessToken)) {
					updates.accessToken = encrypt(record.accessToken);
				}
				if (record.refreshToken && !isEncrypted(record.refreshToken)) {
					updates.refreshToken = encrypt(record.refreshToken);
				}

				if (Object.keys(updates).length > 0) {
					await db
						.update(gitea)
						.set(updates)
						.where(eq(gitea.giteaId, record.giteaId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`Gitea ${record.giteaId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query Gitea providers: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateBitbucket(): Promise<MigrationResult> {
	console.log("\n🪣 Migrating Bitbucket providers...");
	const result: MigrationResult = {
		table: "bitbucket",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.bitbucket.findMany();
		console.log(`  Found ${records.length} Bitbucket providers`);

		for (const record of records) {
			try {
				if (record.appPassword && !isEncrypted(record.appPassword)) {
					await db
						.update(bitbucket)
						.set({ appPassword: encrypt(record.appPassword) })
						.where(eq(bitbucket.bitbucketId, record.bitbucketId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`Bitbucket ${record.bitbucketId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query Bitbucket providers: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateApplications(): Promise<MigrationResult> {
	console.log("\n📦 Migrating applications...");
	const result: MigrationResult = {
		table: "application",
		recordsProcessed: 0,
		errors: [],
	};

	try {
		const records = await db.query.applications.findMany();
		console.log(`  Found ${records.length} applications`);

		for (const record of records) {
			try {
				if (record.password && !isEncrypted(record.password)) {
					await db
						.update(applications)
						.set({ password: encrypt(record.password) })
						.where(eq(applications.applicationId, record.applicationId));
					result.recordsProcessed++;
				}
			} catch (error) {
				result.errors.push(
					`Application ${record.applicationId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		result.errors.push(
			`Failed to query applications: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return result;
}

async function migrateDatabases(): Promise<MigrationResult[]> {
	const results: MigrationResult[] = [];

	// Redis
	console.log("\n🔴 Migrating Redis databases...");
	const redisResult: MigrationResult = {
		table: "redis",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.redis.findMany();
		console.log(`  Found ${records.length} Redis instances`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.databasePassword)) {
					await db
						.update(redis)
						.set({ databasePassword: encrypt(record.databasePassword) })
						.where(eq(redis.redisId, record.redisId));
					redisResult.recordsProcessed++;
				}
			} catch (error) {
				redisResult.errors.push(
					`Redis ${record.redisId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		redisResult.errors.push(
			`Failed to query Redis: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(redisResult);

	// MySQL
	console.log("\n🐬 Migrating MySQL databases...");
	const mysqlResult: MigrationResult = {
		table: "mysql",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.mysql.findMany();
		console.log(`  Found ${records.length} MySQL instances`);
		for (const record of records) {
			try {
				const updates: Record<string, string> = {};
				if (!isEncrypted(record.databasePassword)) {
					updates.databasePassword = encrypt(record.databasePassword);
				}
				if (!isEncrypted(record.databaseRootPassword)) {
					updates.databaseRootPassword = encrypt(record.databaseRootPassword);
				}
				if (Object.keys(updates).length > 0) {
					await db
						.update(mysql)
						.set(updates)
						.where(eq(mysql.mysqlId, record.mysqlId));
					mysqlResult.recordsProcessed++;
				}
			} catch (error) {
				mysqlResult.errors.push(
					`MySQL ${record.mysqlId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		mysqlResult.errors.push(
			`Failed to query MySQL: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(mysqlResult);

	// MariaDB
	console.log("\n🦭 Migrating MariaDB databases...");
	const mariadbResult: MigrationResult = {
		table: "mariadb",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.mariadb.findMany();
		console.log(`  Found ${records.length} MariaDB instances`);
		for (const record of records) {
			try {
				const updates: Record<string, string> = {};
				if (!isEncrypted(record.databasePassword)) {
					updates.databasePassword = encrypt(record.databasePassword);
				}
				if (!isEncrypted(record.databaseRootPassword)) {
					updates.databaseRootPassword = encrypt(record.databaseRootPassword);
				}
				if (Object.keys(updates).length > 0) {
					await db
						.update(mariadb)
						.set(updates)
						.where(eq(mariadb.mariadbId, record.mariadbId));
					mariadbResult.recordsProcessed++;
				}
			} catch (error) {
				mariadbResult.errors.push(
					`MariaDB ${record.mariadbId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		mariadbResult.errors.push(
			`Failed to query MariaDB: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(mariadbResult);

	// PostgreSQL
	console.log("\n🐘 Migrating PostgreSQL databases...");
	const postgresResult: MigrationResult = {
		table: "postgres",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.postgres.findMany();
		console.log(`  Found ${records.length} PostgreSQL instances`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.databasePassword)) {
					await db
						.update(postgres)
						.set({ databasePassword: encrypt(record.databasePassword) })
						.where(eq(postgres.postgresId, record.postgresId));
					postgresResult.recordsProcessed++;
				}
			} catch (error) {
				postgresResult.errors.push(
					`PostgreSQL ${record.postgresId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		postgresResult.errors.push(
			`Failed to query PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(postgresResult);

	// MongoDB
	console.log("\n🍃 Migrating MongoDB databases...");
	const mongoResult: MigrationResult = {
		table: "mongo",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.mongo.findMany();
		console.log(`  Found ${records.length} MongoDB instances`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.databasePassword)) {
					await db
						.update(mongo)
						.set({ databasePassword: encrypt(record.databasePassword) })
						.where(eq(mongo.mongoId, record.mongoId));
					mongoResult.recordsProcessed++;
				}
			} catch (error) {
				mongoResult.errors.push(
					`MongoDB ${record.mongoId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		mongoResult.errors.push(
			`Failed to query MongoDB: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(mongoResult);

	return results;
}

async function migrateNotifications(): Promise<MigrationResult[]> {
	const results: MigrationResult[] = [];

	// Slack
	console.log("\n💬 Migrating Slack notifications...");
	const slackResult: MigrationResult = {
		table: "slack",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.slack.findMany();
		console.log(`  Found ${records.length} Slack configurations`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.webhookUrl)) {
					await db
						.update(slack)
						.set({ webhookUrl: encrypt(record.webhookUrl) })
						.where(eq(slack.slackId, record.slackId));
					slackResult.recordsProcessed++;
				}
			} catch (error) {
				slackResult.errors.push(
					`Slack ${record.slackId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		slackResult.errors.push(
			`Failed to query Slack: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(slackResult);

	// Discord
	console.log("\n🎮 Migrating Discord notifications...");
	const discordResult: MigrationResult = {
		table: "discord",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.discord.findMany();
		console.log(`  Found ${records.length} Discord configurations`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.webhookUrl)) {
					await db
						.update(discord)
						.set({ webhookUrl: encrypt(record.webhookUrl) })
						.where(eq(discord.discordId, record.discordId));
					discordResult.recordsProcessed++;
				}
			} catch (error) {
				discordResult.errors.push(
					`Discord ${record.discordId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		discordResult.errors.push(
			`Failed to query Discord: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(discordResult);

	// Telegram
	console.log("\n✈️ Migrating Telegram notifications...");
	const telegramResult: MigrationResult = {
		table: "telegram",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.telegram.findMany();
		console.log(`  Found ${records.length} Telegram configurations`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.botToken)) {
					await db
						.update(telegram)
						.set({ botToken: encrypt(record.botToken) })
						.where(eq(telegram.telegramId, record.telegramId));
					telegramResult.recordsProcessed++;
				}
			} catch (error) {
				telegramResult.errors.push(
					`Telegram ${record.telegramId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		telegramResult.errors.push(
			`Failed to query Telegram: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(telegramResult);

	// Email
	console.log("\n📧 Migrating Email notifications...");
	const emailResult: MigrationResult = {
		table: "email",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.email.findMany();
		console.log(`  Found ${records.length} Email configurations`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.password)) {
					await db
						.update(email)
						.set({ password: encrypt(record.password) })
						.where(eq(email.emailId, record.emailId));
					emailResult.recordsProcessed++;
				}
			} catch (error) {
				emailResult.errors.push(
					`Email ${record.emailId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		emailResult.errors.push(
			`Failed to query Email: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(emailResult);

	// Gotify
	console.log("\n📱 Migrating Gotify notifications...");
	const gotifyResult: MigrationResult = {
		table: "gotify",
		recordsProcessed: 0,
		errors: [],
	};
	try {
		const records = await db.query.gotify.findMany();
		console.log(`  Found ${records.length} Gotify configurations`);
		for (const record of records) {
			try {
				if (!isEncrypted(record.appToken)) {
					await db
						.update(gotify)
						.set({ appToken: encrypt(record.appToken) })
						.where(eq(gotify.gotifyId, record.gotifyId));
					gotifyResult.recordsProcessed++;
				}
			} catch (error) {
				gotifyResult.errors.push(
					`Gotify ${record.gotifyId}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		gotifyResult.errors.push(
			`Failed to query Gotify: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	results.push(gotifyResult);

	return results;
}

async function main() {
	console.log("🔐 Starting encryption migration...");
	console.log("⚠️  WARNING: Ensure you have backed up your database!\n");

	// Check if encryption key is set
	if (!process.env.ENCRYPTION_KEY) {
		console.error(
			"❌ ERROR: ENCRYPTION_KEY environment variable is not set!",
		);
		console.error("Generate one with: openssl rand -hex 32");
		process.exit(1);
	}

	const allResults: MigrationResult[] = [];

	try {
		// Run all migrations
		allResults.push(await migrateCertificates());
		allResults.push(await migrateSshKeys());
		allResults.push(await migrateRegistries());
		allResults.push(await migrateGithub());
		allResults.push(await migrateGitlab());
		allResults.push(await migrateGitea());
		allResults.push(await migrateBitbucket());
		allResults.push(await migrateApplications());
		allResults.push(...(await migrateDatabases()));
		allResults.push(...(await migrateNotifications()));

		// Print summary
		console.log("\n" + "=".repeat(60));
		console.log("📊 MIGRATION SUMMARY");
		console.log("=".repeat(60));

		let totalProcessed = 0;
		let totalErrors = 0;

		for (const result of allResults) {
			console.log(`\n${result.table}:`);
			console.log(`  ✅ Records processed: ${result.recordsProcessed}`);
			if (result.errors.length > 0) {
				console.log(`  ❌ Errors: ${result.errors.length}`);
				for (const error of result.errors) {
					console.log(`     - ${error}`);
				}
			}
			totalProcessed += result.recordsProcessed;
			totalErrors += result.errors.length;
		}

		console.log("\n" + "=".repeat(60));
		console.log(`Total records encrypted: ${totalProcessed}`);
		console.log(`Total errors: ${totalErrors}`);
		console.log("=".repeat(60));

		if (totalErrors > 0) {
			console.log("\n⚠️  Migration completed with errors!");
			console.log("Please review the errors above and fix them manually.");
			process.exit(1);
		}

		console.log("\n✅ Migration completed successfully!");
		console.log(
			"\n📝 Next steps:",
		);
		console.log("1. Verify encrypted data is accessible");
		console.log("2. Test all API endpoints");
		console.log("3. Run Drizzle migrations if needed");
		console.log("4. Monitor application logs for decryption errors");
	} catch (error) {
		console.error("\n❌ Fatal error during migration:");
		console.error(error);
		process.exit(1);
	}
}

// Run migration if executed directly
if (require.main === module) {
	main().catch((error) => {
		console.error("Unhandled error:", error);
		process.exit(1);
	});
}

export { main as migrateEncryption };
