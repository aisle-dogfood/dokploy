/**
 * Migration script to encrypt existing plaintext secrets in the database
 * 
 * This script should be run once after deploying the encryption changes.
 * It will:
 * 1. Encrypt all plaintext S3 secret access keys
 * 2. Hash all plaintext passwords (registry, security, redis, email)
 * 3. Encrypt all plaintext private keys (certificates, SSH keys)
 * 4. Encrypt all plaintext notification tokens/webhooks
 * 
 * Usage:
 * 1. Ensure ENCRYPTION_KEY environment variable is set
 * 2. Run: pnpm tsx packages/server/scripts/migrate-encrypt-secrets.ts
 */

import { db } from "../src/db";
import {
	certificates,
	destinations,
	discord,
	email,
	gotify,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
	registry,
	security,
	slack,
	sshKeys,
	telegram,
} from "../src/db/schema";
import {
	encryptSecret,
	hashPassword,
	isBcryptHash,
	isEncrypted,
} from "../src/db/schema/utils";
import { eq } from "drizzle-orm";

async function migrateDestinations() {
	console.log("\n🔐 Migrating destinations (S3 secret access keys)...");
	const allDestinations = await db.query.destinations.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const dest of allDestinations) {
		// Check if already encrypted
		if (isEncrypted(dest.secretAccessKey)) {
			skipped++;
			continue;
		}

		// Encrypt the secret access key
		const encrypted = encryptSecret(dest.secretAccessKey);

		await db
			.update(destinations)
			.set({ secretAccessKey: encrypted })
			.where(eq(destinations.destinationId, dest.destinationId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} destinations, skipped ${skipped} already encrypted`,
	);
}

async function migrateRegistries() {
	console.log("\n🔐 Migrating registry passwords...");
	const allRegistries = await db.query.registry.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const reg of allRegistries) {
		// Check if already hashed
		if (isBcryptHash(reg.password)) {
			skipped++;
			continue;
		}

		// Hash the password
		const hashed = await hashPassword(reg.password);

		await db
			.update(registry)
			.set({ password: hashed })
			.where(eq(registry.registryId, reg.registryId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} registries, skipped ${skipped} already hashed`,
	);
}

async function migrateSecurityPasswords() {
	console.log("\n🔐 Migrating security (basic auth) passwords...");
	const allSecurity = await db.query.security.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const sec of allSecurity) {
		// Check if already hashed
		if (isBcryptHash(sec.password)) {
			skipped++;
			continue;
		}

		// Hash the password
		const hashed = await hashPassword(sec.password);

		await db
			.update(security)
			.set({ password: hashed })
			.where(eq(security.securityId, sec.securityId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} security entries, skipped ${skipped} already hashed`,
	);
}

async function migrateRedisPasswords() {
	console.log("\n🔐 Migrating Redis passwords...");
	const allRedis = await db.query.redis.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const r of allRedis) {
		// Check if already hashed
		if (isBcryptHash(r.databasePassword)) {
			skipped++;
			continue;
		}

		// Hash the password
		const hashed = await hashPassword(r.databasePassword);

		await db
			.update(redis)
			.set({ databasePassword: hashed })
			.where(eq(redis.redisId, r.redisId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} Redis instances, skipped ${skipped} already hashed`,
	);
}

async function migrateCertificates() {
	console.log("\n🔐 Migrating certificate private keys...");
	const allCerts = await db.query.certificates.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const cert of allCerts) {
		// Check if already encrypted
		if (isEncrypted(cert.privateKey)) {
			skipped++;
			continue;
		}

		// Encrypt the private key
		const encrypted = encryptSecret(cert.privateKey);

		await db
			.update(certificates)
			.set({ privateKey: encrypted })
			.where(eq(certificates.certificateId, cert.certificateId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} certificates, skipped ${skipped} already encrypted`,
	);
}

async function migrateSSHKeys() {
	console.log("\n🔐 Migrating SSH private keys...");
	const allKeys = await db.query.sshKeys.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const key of allKeys) {
		// Skip empty private keys
		if (!key.privateKey) {
			skipped++;
			continue;
		}

		// Check if already encrypted
		if (isEncrypted(key.privateKey)) {
			skipped++;
			continue;
		}

		// Encrypt the private key
		const encrypted = encryptSecret(key.privateKey);

		await db
			.update(sshKeys)
			.set({ privateKey: encrypted })
			.where(eq(sshKeys.sshKeyId, key.sshKeyId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} SSH keys, skipped ${skipped} already encrypted or empty`,
	);
}

async function migrateEmailPasswords() {
	console.log("\n🔐 Migrating email notification passwords...");
	const allEmails = await db.query.email.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const e of allEmails) {
		// Check if already hashed
		if (isBcryptHash(e.password)) {
			skipped++;
			continue;
		}

		// Hash the password
		const hashed = await hashPassword(e.password);

		await db
			.update(email)
			.set({ password: hashed })
			.where(eq(email.emailId, e.emailId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} email configs, skipped ${skipped} already hashed`,
	);
}

async function migrateTelegramTokens() {
	console.log("\n🔐 Migrating Telegram bot tokens...");
	const allTelegram = await db.query.telegram.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const t of allTelegram) {
		// Check if already encrypted
		if (isEncrypted(t.botToken)) {
			skipped++;
			continue;
		}

		// Encrypt the bot token
		const encrypted = encryptSecret(t.botToken);

		await db
			.update(telegram)
			.set({ botToken: encrypted })
			.where(eq(telegram.telegramId, t.telegramId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} Telegram configs, skipped ${skipped} already encrypted`,
	);
}

async function migrateSlackWebhooks() {
	console.log("\n🔐 Migrating Slack webhook URLs...");
	const allSlack = await db.query.slack.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const s of allSlack) {
		// Check if already encrypted
		if (isEncrypted(s.webhookUrl)) {
			skipped++;
			continue;
		}

		// Encrypt the webhook URL
		const encrypted = encryptSecret(s.webhookUrl);

		await db
			.update(slack)
			.set({ webhookUrl: encrypted })
			.where(eq(slack.slackId, s.slackId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} Slack configs, skipped ${skipped} already encrypted`,
	);
}

async function migrateDiscordWebhooks() {
	console.log("\n🔐 Migrating Discord webhook URLs...");
	const allDiscord = await db.query.discord.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const d of allDiscord) {
		// Check if already encrypted
		if (isEncrypted(d.webhookUrl)) {
			skipped++;
			continue;
		}

		// Encrypt the webhook URL
		const encrypted = encryptSecret(d.webhookUrl);

		await db
			.update(discord)
			.set({ webhookUrl: encrypted })
			.where(eq(discord.discordId, d.discordId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} Discord configs, skipped ${skipped} already encrypted`,
	);
}

async function migrateGotifyTokens() {
	console.log("\n🔐 Migrating Gotify app tokens...");
	const allGotify = await db.query.gotify.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const g of allGotify) {
		// Check if already encrypted
		if (isEncrypted(g.appToken)) {
			skipped++;
			continue;
		}

		// Encrypt the app token
		const encrypted = encryptSecret(g.appToken);

		await db
			.update(gotify)
			.set({ appToken: encrypted })
			.where(eq(gotify.gotifyId, g.gotifyId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} Gotify configs, skipped ${skipped} already encrypted`,
	);
}

async function migrateMySQLPasswords() {
	console.log("\n🔐 Migrating MySQL passwords...");
	const allMySQL = await db.query.mysql.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const m of allMySQL) {
		let needsUpdate = false;
		const updates: { databasePassword?: string; databaseRootPassword?: string } =
			{};

		// Check and hash databasePassword if needed
		if (!isBcryptHash(m.databasePassword)) {
			updates.databasePassword = await hashPassword(m.databasePassword);
			needsUpdate = true;
		}

		// Check and hash databaseRootPassword if needed
		if (
			m.databaseRootPassword &&
			!isBcryptHash(m.databaseRootPassword)
		) {
			updates.databaseRootPassword = await hashPassword(
				m.databaseRootPassword,
			);
			needsUpdate = true;
		}

		if (needsUpdate) {
			await db
				.update(mysql)
				.set(updates)
				.where(eq(mysql.mysqlId, m.mysqlId));
			migrated++;
		} else {
			skipped++;
		}
	}

	console.log(
		`  ✅ Migrated ${migrated} MySQL instances, skipped ${skipped} already hashed`,
	);
}

async function migratePostgresPasswords() {
	console.log("\n🔐 Migrating PostgreSQL passwords...");
	const allPostgres = await db.query.postgres.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const p of allPostgres) {
		// Check if already hashed
		if (isBcryptHash(p.databasePassword)) {
			skipped++;
			continue;
		}

		// Hash the password
		const hashed = await hashPassword(p.databasePassword);

		await db
			.update(postgres)
			.set({ databasePassword: hashed })
			.where(eq(postgres.postgresId, p.postgresId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} PostgreSQL instances, skipped ${skipped} already hashed`,
	);
}

async function migrateMongoPasswords() {
	console.log("\n🔐 Migrating MongoDB passwords...");
	const allMongo = await db.query.mongo.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const m of allMongo) {
		// Check if already hashed
		if (isBcryptHash(m.databasePassword)) {
			skipped++;
			continue;
		}

		// Hash the password
		const hashed = await hashPassword(m.databasePassword);

		await db
			.update(mongo)
			.set({ databasePassword: hashed })
			.where(eq(mongo.mongoId, m.mongoId));

		migrated++;
	}

	console.log(
		`  ✅ Migrated ${migrated} MongoDB instances, skipped ${skipped} already hashed`,
	);
}

async function migrateMariaDBPasswords() {
	console.log("\n🔐 Migrating MariaDB passwords...");
	const allMariaDB = await db.query.mariadb.findMany();

	let migrated = 0;
	let skipped = 0;

	for (const m of allMariaDB) {
		let needsUpdate = false;
		const updates: { databasePassword?: string; databaseRootPassword?: string } =
			{};

		// Check and hash databasePassword if needed
		if (!isBcryptHash(m.databasePassword)) {
			updates.databasePassword = await hashPassword(m.databasePassword);
			needsUpdate = true;
		}

		// Check and hash databaseRootPassword if needed
		if (
			m.databaseRootPassword &&
			!isBcryptHash(m.databaseRootPassword)
		) {
			updates.databaseRootPassword = await hashPassword(
				m.databaseRootPassword,
			);
			needsUpdate = true;
		}

		if (needsUpdate) {
			await db
				.update(mariadb)
				.set(updates)
				.where(eq(mariadb.mariadbId, m.mariadbId));
			migrated++;
		} else {
			skipped++;
		}
	}

	console.log(
		`  ✅ Migrated ${migrated} MariaDB instances, skipped ${skipped} already hashed`,
	);
}

async function main() {
	console.log("🚀 Starting secret encryption migration...");
	console.log(
		"⚠️  This script will encrypt/hash all plaintext secrets in the database.",
	);

	try {
		// Check if ENCRYPTION_KEY is set
		if (!process.env.ENCRYPTION_KEY) {
			throw new Error(
				"ENCRYPTION_KEY environment variable is not set. Please set a 32-byte hex-encoded key using: export ENCRYPTION_KEY=$(openssl rand -hex 32)",
			);
		}

		// Run all migrations
		await migrateDestinations();
		await migrateRegistries();
		await migrateSecurityPasswords();
		await migrateRedisPasswords();
		await migrateCertificates();
		await migrateSSHKeys();
		await migrateEmailPasswords();
		await migrateTelegramTokens();
		await migrateSlackWebhooks();
		await migrateDiscordWebhooks();
		await migrateGotifyTokens();
		await migrateMySQLPasswords();
		await migratePostgresPasswords();
		await migrateMongoPasswords();
		await migrateMariaDBPasswords();

		console.log("\n✅ Migration completed successfully!");
		console.log(
			"\n⚠️  IMPORTANT: Make sure to back up your ENCRYPTION_KEY securely!",
		);
		console.log("   Store it in a secure location (e.g., password manager, vault).");
		console.log(
			"   Without this key, encrypted data cannot be decrypted.\n",
		);
	} catch (error) {
		console.error("\n❌ Migration failed:", error);
		process.exit(1);
	}
}

// Run the migration
main();
