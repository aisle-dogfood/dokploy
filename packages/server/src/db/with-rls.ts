/**
 * Database wrapper with automatic RLS context
 * 
 * This module provides a wrapped database instance that automatically
 * sets the RLS context based on the current session/user.
 * 
 * It integrates with the authentication system to extract organization
 * memberships and apply them to all database queries.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { db as baseDb } from "./index";
import { getUserOrganizationIds, setRLSContext } from "./rls-context";
import type * as schema from "./schema";

/**
 * Create a database instance with RLS context for a specific user
 * 
 * @param userId - The current user's ID
 * @returns A promise that resolves to a database instance with RLS context set
 */
export async function createRLSDatabase(
	userId: string,
): Promise<PostgresJsDatabase<typeof schema>> {
	const organizationIds = await getUserOrganizationIds(baseDb, userId);
	await setRLSContext(baseDb, organizationIds);
	return baseDb;
}

/**
 * Middleware helper to extract user from session and set RLS context
 * 
 * Usage in tRPC or API routes:
 * ```typescript
 * const dbWithRLS = await getRLSDatabaseFromSession(session);
 * const projects = await dbWithRLS.query.projects.findMany();
 * ```
 */
export async function getRLSDatabaseFromSession(session: {
	user?: { id: string };
}): Promise<PostgresJsDatabase<typeof schema>> {
	if (!session.user?.id) {
		throw new Error("No authenticated user in session");
	}

	return await createRLSDatabase(session.user.id);
}

/**
 * Get database with RLS context for specific organizations
 * Useful when you already know which organizations to scope to
 * 
 * @param organizationIds - Array of organization IDs to scope queries to
 * @returns Database instance with RLS context
 */
export async function getRLSDatabaseForOrganizations(
	organizationIds: string[],
): Promise<PostgresJsDatabase<typeof schema>> {
	await setRLSContext(baseDb, organizationIds);
	return baseDb;
}
