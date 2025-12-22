/**
 * Row-Level Security Context Management
 * 
 * This module provides utilities to set and manage PostgreSQL session variables
 * for Row-Level Security (RLS) policies. It ensures that database queries are
 * automatically filtered based on the user's organization memberships.
 * 
 * Usage:
 * ```typescript
 * import { withRLSContext } from './db/rls-context';
 * 
 * // In your API handlers or service layer:
 * const result = await withRLSContext(db, organizationIds, async (db) => {
 *   return await db.query.projects.findMany();
 * });
 * ```
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

/**
 * Set the current user's organization context for RLS policies
 * @param db - Drizzle database instance
 * @param organizationIds - Array of organization IDs the user has access to
 */
export async function setRLSContext(
	db: PostgresJsDatabase<typeof schema>,
	organizationIds: string[],
): Promise<void> {
	// Set the session variable with comma-separated organization IDs
	const orgIdsStr = organizationIds.join(",");
	await db.execute(
		sql`SET LOCAL app.current_user_organizations = ${orgIdsStr}`,
	);
}

/**
 * Clear the RLS context (reset session variable)
 * @param db - Drizzle database instance
 */
export async function clearRLSContext(
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	await db.execute(sql`RESET app.current_user_organizations`);
}

/**
 * Execute a callback within an RLS context
 * This automatically sets and clears the RLS context for the operation
 * 
 * @param db - Drizzle database instance
 * @param organizationIds - Array of organization IDs the user has access to
 * @param callback - Async function to execute with RLS context
 * @returns The result of the callback
 */
export async function withRLSContext<T>(
	db: PostgresJsDatabase<typeof schema>,
	organizationIds: string[],
	callback: (db: PostgresJsDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
	try {
		await setRLSContext(db, organizationIds);
		return await callback(db);
	} finally {
		await clearRLSContext(db);
	}
}

/**
 * Execute a callback within a transaction with RLS context
 * This combines transaction management with RLS context setting
 * 
 * @param db - Drizzle database instance
 * @param organizationIds - Array of organization IDs the user has access to
 * @param callback - Async function to execute within transaction and RLS context
 * @returns The result of the callback
 */
export async function withRLSTransaction<T>(
	db: PostgresJsDatabase<typeof schema>,
	organizationIds: string[],
	callback: (
		tx: PostgresJsDatabase<typeof schema>,
	) => Promise<T> | T,
): Promise<T> {
	return await db.transaction(async (tx) => {
		await setRLSContext(tx, organizationIds);
		return await callback(tx);
	});
}

/**
 * Get organization IDs for a user from the member table
 * This is a helper to retrieve which organizations a user belongs to
 * 
 * @param db - Drizzle database instance
 * @param userId - The user's ID
 * @returns Array of organization IDs the user is a member of
 */
export async function getUserOrganizationIds(
	db: PostgresJsDatabase<typeof schema>,
	userId: string,
): Promise<string[]> {
	const members = await db.query.member.findMany({
		where: (member, { eq }) => eq(member.userId, userId),
		columns: {
			organizationId: true,
		},
	});

	return members.map((m) => m.organizationId);
}

/**
 * Bypass RLS for administrative operations
 * WARNING: Use with extreme caution! This disables all RLS protections.
 * Only use for system-level operations like migrations or admin tasks.
 * 
 * @param db - Drizzle database instance
 * @param callback - Async function to execute without RLS
 * @returns The result of the callback
 */
export async function bypassRLS<T>(
	db: PostgresJsDatabase<typeof schema>,
	callback: (db: PostgresJsDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
	try {
		// Disable RLS for this session
		await db.execute(sql`SET LOCAL row_security = off`);
		return await callback(db);
	} finally {
		// Re-enable RLS
		await db.execute(sql`SET LOCAL row_security = on`);
	}
}
