import { relations } from "drizzle-orm";
import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";

export const redirects = pgTable("redirect", {
	redirectId: text("redirectId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	regex: text("regex").notNull(),
	replacement: text("replacement").notNull(),
	permanent: boolean("permanent").notNull().default(false),
	uniqueConfigKey: serial("uniqueConfigKey"),
	createdAt: timestamp("createdAt", { mode: "string" })
		.notNull()
		.defaultNow(),
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, { onDelete: "cascade" }),
});

export const redirectRelations = relations(redirects, ({ one }) => ({
	application: one(applications, {
		fields: [redirects.applicationId],
		references: [applications.applicationId],
	}),
}));
const createSchema = createInsertSchema(redirects, {
	redirectId: z.string().min(1),
	regex: z.string().min(1),
	replacement: z.string().min(1),
	permanent: z.boolean().optional(),
});

export const apiFindOneRedirect = createSchema
	.pick({
		redirectId: true,
	})
	.required();

export const apiCreateRedirect = createSchema
	.pick({
		regex: true,
		replacement: true,
		permanent: true,
		applicationId: true,
	})
	.required();

export const apiUpdateRedirect = createSchema
	.pick({
		redirectId: true,
		regex: true,
		replacement: true,
		permanent: true,
	})
	.required();
