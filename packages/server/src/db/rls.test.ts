/**
 * Row-Level Security (RLS) Tests
 * 
 * These tests verify that RLS policies correctly isolate data between organizations
 * 
 * To run: npm test -- rls.test.ts
 */

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./index";
import { bypassRLS, withRLSContext } from "./rls-context";
import * as schema from "./schema";

describe("Row-Level Security", () => {
	// Test data
	const org1Id = "test-org-1";
	const org2Id = "test-org-2";
	const userId1 = "test-user-1";
	const userId2 = "test-user-2";

	beforeEach(async () => {
		// Clean up test data
		await bypassRLS(db, async (db) => {
			await db.delete(schema.projects);
			await db.delete(schema.member);
			await db.delete(schema.organization);
			await db.delete(schema.users_temp);
		});
	});

	describe("Organization Table", () => {
		it("should only return organizations user has access to", async () => {
			// Setup: Create organizations and memberships
			await bypassRLS(db, async (db) => {
				await db.insert(schema.organization).values([
					{ id: org1Id, name: "Org 1", ownerId: userId1, createdAt: new Date() },
					{ id: org2Id, name: "Org 2", ownerId: userId2, createdAt: new Date() },
				]);
			});

			// Test: User 1 can only see org1
			const user1Orgs = await withRLSContext(db, [org1Id], async (db) => {
				return await db.query.organization.findMany();
			});

			expect(user1Orgs).toHaveLength(1);
			expect(user1Orgs[0].id).toBe(org1Id);

			// Test: User 2 can only see org2
			const user2Orgs = await withRLSContext(db, [org2Id], async (db) => {
				return await db.query.organization.findMany();
			});

			expect(user2Orgs).toHaveLength(1);
			expect(user2Orgs[0].id).toBe(org2Id);
		});
	});

	describe("Project Table", () => {
		it("should only return projects from accessible organizations", async () => {
			// Setup: Create projects in different organizations
			await bypassRLS(db, async (db) => {
				await db.insert(schema.organization).values([
					{ id: org1Id, name: "Org 1", ownerId: userId1, createdAt: new Date() },
					{ id: org2Id, name: "Org 2", ownerId: userId2, createdAt: new Date() },
				]);

				await db.insert(schema.projects).values([
					{
						projectId: "proj-1",
						name: "Project 1",
						organizationId: org1Id,
						createdAt: new Date().toISOString(),
					},
					{
						projectId: "proj-2",
						name: "Project 2",
						organizationId: org2Id,
						createdAt: new Date().toISOString(),
					},
				]);
			});

			// Test: User can only see projects from their organization
			const user1Projects = await withRLSContext(db, [org1Id], async (db) => {
				return await db.query.projects.findMany();
			});

			expect(user1Projects).toHaveLength(1);
			expect(user1Projects[0].organizationId).toBe(org1Id);
			expect(user1Projects[0].name).toBe("Project 1");
		});
	});

	describe("Application Table (Nested Relationships)", () => {
		it("should only return applications from accessible projects", async () => {
			// Setup: Create full hierarchy
			await bypassRLS(db, async (db) => {
				// Create organizations
				await db.insert(schema.organization).values([
					{ id: org1Id, name: "Org 1", ownerId: userId1, createdAt: new Date() },
					{ id: org2Id, name: "Org 2", ownerId: userId2, createdAt: new Date() },
				]);

				// Create projects
				await db.insert(schema.projects).values([
					{
						projectId: "proj-1",
						name: "Project 1",
						organizationId: org1Id,
						createdAt: new Date().toISOString(),
					},
					{
						projectId: "proj-2",
						name: "Project 2",
						organizationId: org2Id,
						createdAt: new Date().toISOString(),
					},
				]);

				// Create applications
				await db.insert(schema.applications).values([
					{
						applicationId: "app-1",
						name: "App 1",
						projectId: "proj-1",
						createdAt: new Date().toISOString(),
					},
					{
						applicationId: "app-2",
						name: "App 2",
						projectId: "proj-2",
						createdAt: new Date().toISOString(),
					},
				]);
			});

			// Test: User can only see applications from their organization's projects
			const user1Apps = await withRLSContext(db, [org1Id], async (db) => {
				return await db.query.applications.findMany();
			});

			expect(user1Apps).toHaveLength(1);
			expect(user1Apps[0].name).toBe("App 1");
			expect(user1Apps[0].projectId).toBe("proj-1");
		});
	});

	describe("Multi-Organization Access", () => {
		it("should return data from all accessible organizations", async () => {
			const org3Id = "test-org-3";

			// Setup: Create multiple organizations and projects
			await bypassRLS(db, async (db) => {
				await db.insert(schema.organization).values([
					{ id: org1Id, name: "Org 1", ownerId: userId1, createdAt: new Date() },
					{ id: org2Id, name: "Org 2", ownerId: userId2, createdAt: new Date() },
					{ id: org3Id, name: "Org 3", ownerId: userId1, createdAt: new Date() },
				]);

				await db.insert(schema.projects).values([
					{
						projectId: "proj-1",
						name: "Project 1",
						organizationId: org1Id,
						createdAt: new Date().toISOString(),
					},
					{
						projectId: "proj-2",
						name: "Project 2",
						organizationId: org2Id,
						createdAt: new Date().toISOString(),
					},
					{
						projectId: "proj-3",
						name: "Project 3",
						organizationId: org3Id,
						createdAt: new Date().toISOString(),
					},
				]);
			});

			// Test: User with access to org1 and org3 sees both
			const projects = await withRLSContext(
				db,
				[org1Id, org3Id],
				async (db) => {
					return await db.query.projects.findMany();
				},
			);

			expect(projects).toHaveLength(2);
			const projectOrgIds = projects.map((p) => p.organizationId).sort();
			expect(projectOrgIds).toEqual([org1Id, org3Id].sort());
		});
	});
});
