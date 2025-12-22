/**
 * Migration script to encrypt existing plaintext secrets in the database
 * 
 * This script should be run once after deploying the encryption changes.
 * It will:
 * 1. Find all plaintext (unencrypted) sensitive fields
 * 2. Encrypt them using the ENCRYPTION_KEY
 * 3. Update the database records
 * 
 * Usage:
 *   npx tsx src/db/migrate-encrypt-secrets.ts
 */

import { sql } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import { db } from "./index";
import * as schema from "./schema";
import { encrypt, isEncrypted, isBcryptHash } from "../utils/encryption";

interface MigrationStats {
	table: string;
	total: number;
	encrypted: number;
	alreadyEncrypted: number;
	errors: number;
}

const stats: MigrationStats[] = [];

async function migrateCertificates() {
	console.log("🔐 Migrating certificates...");
	const tableName = "certificate";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const certificates = await db.query.certificates.findMany();
		stat.total = certificates.length;

		for (const cert of certificates) {
			try {
				if (cert.privateKey && !isEncrypted(cert.privateKey)) {
					await db
						.update(schema.certificates)
						.set({ privateKey: encrypt(cert.privateKey) })
						.where(sql`${schema.certificates.certificateId} = ${cert.certificateId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(
					`Error encrypting certificate ${cert.certificateId}:`,
					error,
				);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating certificates:", error);
	}

	stats.push(stat);
}

async function migrateDestinations() {
	console.log("🔐 Migrating destinations...");
	const tableName = "destination";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const destinations = await db.query.destinations.findMany();
		stat.total = destinations.length;

		for (const dest of destinations) {
			try {
				if (dest.secretAccessKey && !isEncrypted(dest.secretAccessKey)) {
					await db
						.update(schema.destinations)
						.set({ secretAccessKey: encrypt(dest.secretAccessKey) })
						.where(
							sql`${schema.destinations.destinationId} = ${dest.destinationId}`,
						);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(
					`Error encrypting destination ${dest.destinationId}:`,
					error,
				);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating destinations:", error);
	}

	stats.push(stat);
}

async function migrateRegistries() {
	console.log("🔐 Migrating registries...");
	const tableName = "registry";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const registries = await db.query.registry.findMany();
		stat.total = registries.length;

		for (const reg of registries) {
			try {
				if (reg.password && !isEncrypted(reg.password)) {
					await db
						.update(schema.registry)
						.set({ password: encrypt(reg.password) })
						.where(sql`${schema.registry.registryId} = ${reg.registryId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting registry ${reg.registryId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating registries:", error);
	}

	stats.push(stat);
}

async function migrateEmails() {
	console.log("🔐 Migrating email configurations...");
	const tableName = "email";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const emails = await db.query.email.findMany();
		stat.total = emails.length;

		for (const email of emails) {
			try {
				if (email.password && !isEncrypted(email.password)) {
					await db
						.update(schema.email)
						.set({ password: encrypt(email.password) })
						.where(sql`${schema.email.emailId} = ${email.emailId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting email ${email.emailId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating emails:", error);
	}

	stats.push(stat);
}

async function migrateSshKeys() {
	console.log("🔐 Migrating SSH keys...");
	const tableName = "ssh-key";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const sshKeys = await db.query.sshKeys.findMany();
		stat.total = sshKeys.length;

		for (const key of sshKeys) {
			try {
				if (key.privateKey && !isEncrypted(key.privateKey)) {
					await db
						.update(schema.sshKeys)
						.set({ privateKey: encrypt(key.privateKey) })
						.where(sql`${schema.sshKeys.sshKeyId} = ${key.sshKeyId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting SSH key ${key.sshKeyId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating SSH keys:", error);
	}

	stats.push(stat);
}

async function migrateSecurity() {
	console.log("🔐 Migrating security (HTTP basic auth) passwords...");
	const tableName = "security";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const securityRecords = await db.query.security.findMany();
		stat.total = securityRecords.length;

		for (const sec of securityRecords) {
			try {
				if (sec.password && !isBcryptHash(sec.password)) {
					const hashedPassword = bcrypt.hashSync(sec.password, 10);
					await db
						.update(schema.security)
						.set({ password: hashedPassword })
						.where(sql`${schema.security.securityId} = ${sec.securityId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error hashing security ${sec.securityId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating security:", error);
	}

	stats.push(stat);
}

async function migrateRedis() {
	console.log("🔐 Migrating Redis passwords...");
	const tableName = "redis";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const redisInstances = await db.query.redis.findMany();
		stat.total = redisInstances.length;

		for (const r of redisInstances) {
			try {
				if (r.databasePassword && !isEncrypted(r.databasePassword)) {
					await db
						.update(schema.redis)
						.set({ databasePassword: encrypt(r.databasePassword) })
						.where(sql`${schema.redis.redisId} = ${r.redisId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting Redis ${r.redisId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating Redis:", error);
	}

	stats.push(stat);
}

async function migrateMySQL() {
	console.log("🔐 Migrating MySQL passwords...");
	const tableName = "mysql";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const mysqlInstances = await db.query.mysql.findMany();
		stat.total = mysqlInstances.length;

		for (const m of mysqlInstances) {
			try {
				let updated = false;
				const updates: any = {};

				if (m.databasePassword && !isEncrypted(m.databasePassword)) {
					updates.databasePassword = encrypt(m.databasePassword);
					updated = true;
				}

				if (
					m.databaseRootPassword &&
					!isEncrypted(m.databaseRootPassword)
				) {
					updates.databaseRootPassword = encrypt(m.databaseRootPassword);
					updated = true;
				}

				if (updated) {
					await db
						.update(schema.mysql)
						.set(updates)
						.where(sql`${schema.mysql.mysqlId} = ${m.mysqlId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting MySQL ${m.mysqlId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating MySQL:", error);
	}

	stats.push(stat);
}

async function migrateMariaDB() {
	console.log("🔐 Migrating MariaDB passwords...");
	const tableName = "mariadb";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const mariadbInstances = await db.query.mariadb.findMany();
		stat.total = mariadbInstances.length;

		for (const m of mariadbInstances) {
			try {
				let updated = false;
				const updates: any = {};

				if (m.databasePassword && !isEncrypted(m.databasePassword)) {
					updates.databasePassword = encrypt(m.databasePassword);
					updated = true;
				}

				if (
					m.databaseRootPassword &&
					!isEncrypted(m.databaseRootPassword)
				) {
					updates.databaseRootPassword = encrypt(m.databaseRootPassword);
					updated = true;
				}

				if (updated) {
					await db
						.update(schema.mariadb)
						.set(updates)
						.where(sql`${schema.mariadb.mariadbId} = ${m.mariadbId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting MariaDB ${m.mariadbId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating MariaDB:", error);
	}

	stats.push(stat);
}

async function migrateMongo() {
	console.log("🔐 Migrating MongoDB passwords...");
	const tableName = "mongo";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const mongoInstances = await db.query.mongo.findMany();
		stat.total = mongoInstances.length;

		for (const m of mongoInstances) {
			try {
				if (m.databasePassword && !isEncrypted(m.databasePassword)) {
					await db
						.update(schema.mongo)
						.set({ databasePassword: encrypt(m.databasePassword) })
						.where(sql`${schema.mongo.mongoId} = ${m.mongoId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting MongoDB ${m.mongoId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating MongoDB:", error);
	}

	stats.push(stat);
}

async function migratePostgres() {
	console.log("🔐 Migrating PostgreSQL passwords...");
	const tableName = "postgres";
	const stat: MigrationStats = {
		table: tableName,
		total: 0,
		encrypted: 0,
		alreadyEncrypted: 0,
		errors: 0,
	};

	try {
		const postgresInstances = await db.query.postgres.findMany();
		stat.total = postgresInstances.length;

		for (const p of postgresInstances) {
			try {
				if (p.databasePassword && !isEncrypted(p.databasePassword)) {
					await db
						.update(schema.postgres)
						.set({ databasePassword: encrypt(p.databasePassword) })
						.where(sql`${schema.postgres.postgresId} = ${p.postgresId}`);
					stat.encrypted++;
				} else {
					stat.alreadyEncrypted++;
				}
			} catch (error) {
				console.error(`Error encrypting PostgreSQL ${p.postgresId}:`, error);
				stat.errors++;
			}
		}
	} catch (error) {
		console.error("Error migrating PostgreSQL:", error);
	}

	stats.push(stat);
}

function printStats() {
	console.log("\n📊 Migration Statistics:");
	console.log("========================");

	let totalRecords = 0;
	let totalEncrypted = 0;
	let totalAlreadyEncrypted = 0;
	let totalErrors = 0;

	for (const stat of stats) {
		console.log(`\n${stat.table}:`);
		console.log(`  Total records: ${stat.total}`);
		console.log(`  Newly encrypted: ${stat.encrypted}`);
		console.log(`  Already encrypted: ${stat.alreadyEncrypted}`);
		console.log(`  Errors: ${stat.errors}`);

		totalRecords += stat.total;
		totalEncrypted += stat.encrypted;
		totalAlreadyEncrypted += stat.alreadyEncrypted;
		totalErrors += stat.errors;
	}

	console.log("\n========================");
	console.log("Overall:");
	console.log(`  Total records processed: ${totalRecords}`);
	console.log(`  Newly encrypted: ${totalEncrypted}`);
	console.log(`  Already encrypted: ${totalAlreadyEncrypted}`);
	console.log(`  Errors: ${totalErrors}`);
	console.log("========================\n");
}

async function main() {
	console.log("🚀 Starting encryption migration...\n");

	// Check if ENCRYPTION_KEY is set
	if (!process.env.ENCRYPTION_KEY) {
		console.error(
			"❌ Error: ENCRYPTION_KEY environment variable is not set!",
		);
		console.error(
			"Please set it with: export ENCRYPTION_KEY=$(openssl rand -hex 32)",
		);
		process.exit(1);
	}

	try {
		await migrateCertificates();
		await migrateDestinations();
		await migrateRegistries();
		await migrateEmails();
		await migrateSshKeys();
		await migrateSecurity();
		await migrateRedis();
		await migrateMySQL();
		await migrateMariaDB();
		await migrateMongo();
		await migratePostgres();

		printStats();

		console.log("✅ Migration completed successfully!");
	} catch (error) {
		console.error("❌ Migration failed:", error);
		process.exit(1);
	}
}

main();
