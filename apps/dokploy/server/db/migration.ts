import { encryptExistingGotifyTokens } from "@dokploy/server";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

export const migration = async () =>
	await migrate(db, { migrationsFolder: "drizzle" })
		.then(async () => {
			console.log("Database schema migration complete");
			// Run data encryption migration for existing tokens
			try {
				await encryptExistingGotifyTokens();
			} catch (error) {
				console.error("Warning: Token encryption migration failed", error);
				// Don't fail the entire migration if token encryption fails
			}
			sql.end();
		})
		.catch((error) => {
			console.log("Migration failed", error);
		})
		.finally(() => {
			sql.end();
		});
