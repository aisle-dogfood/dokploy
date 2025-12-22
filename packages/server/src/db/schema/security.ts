import { relations } from "drizzle-orm";
import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";

// Security table for storing HTTP Basic Auth credentials for applications
// Note: Password field stores bcrypt hashes (not plaintext) for security
// The password is hashed before storage and never returned to clients
export const security = pgTable(
	"security",
	{
		securityId: text("securityId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		username: text("username").notNull(),
		// Password field stores bcrypt hash (e.g., $2b$10$...)
		password: text("password").notNull(),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		applicationId: text("applicationId")
			.notNull()
			.references(() => applications.applicationId, { onDelete: "cascade" }),
	},
	(t) => ({
		unq: unique().on(t.username, t.applicationId),
	}),
);

export const securityRelations = relations(security, ({ one }) => ({
	application: one(applications, {
		fields: [security.applicationId],
		references: [applications.applicationId],
	}),
}));
const createSchema = createInsertSchema(security, {
	securityId: z.string().min(1),
	username: z.string().min(1),
	password: z.string().min(1),
});

export const apiFindOneSecurity = createSchema
	.pick({
		securityId: true,
	})
	.required();

export const apiCreateSecurity = createSchema
	.pick({
		applicationId: true,
		username: true,
		password: true,
	})
	.required();

export const apiUpdateSecurity = createSchema
	.pick({
		securityId: true,
		username: true,
		password: true,
	})
	.required();
