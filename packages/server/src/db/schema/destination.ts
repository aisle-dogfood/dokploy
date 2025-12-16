import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	provider: text("provider"),
	accessKey: text("accessKey").notNull(),
	secretAccessKey: text("secretAccessKey").notNull(),
	bucket: text("bucket").notNull(),
	region: text("region").notNull(),
	endpoint: text("endpoint").notNull(),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const destinationsRelations = relations(
	destinations,
	({ many, one }) => ({
		backups: many(backups),
		organization: one(organization, {
			fields: [destinations.organizationId],
			references: [organization.id],
		}),
	}),
);

const createSchema = createInsertSchema(destinations, {
	destinationId: z.string(),
	name: z.string().min(1),
	provider: z.string().regex(/^[a-zA-Z0-9_-]*$/, "Provider must contain only alphanumeric characters, hyphens, and underscores").max(50),
	accessKey: z.string().regex(/^[a-zA-Z0-9+/=]*$/, "Access key contains invalid characters").max(200),
	bucket: z.string().regex(/^[a-zA-Z0-9._-]*$/, "Bucket name contains invalid characters").min(1).max(63),
	endpoint: z.string().max(200).url("Invalid endpoint URL").refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
		message: "Invalid endpoint URL - must use http:// or https:// protocol"
	}),
	secretAccessKey: z.string().regex(/^[a-zA-Z0-9+/=]*$/, "Secret access key contains invalid characters").max(200),
	region: z.string().regex(/^[a-zA-Z0-9_-]*$/, "Region must contain only alphanumeric characters, hyphens, and underscores").max(50),
});

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		provider: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
	})
	.required()
	.extend({
		serverId: z.string().regex(/^[a-zA-Z0-9_-]*$/, "Server ID contains invalid characters").max(50).optional(),
	});

export const apiFindOneDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiRemoveDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiUpdateDestination = createSchema
	.pick({
		name: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		destinationId: true,
		provider: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
