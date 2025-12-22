# Migration Guide: Integrating Row-Level Security

This guide helps developers update existing code to work with the new Row-Level Security (RLS) system.

## Quick Start Checklist

- [ ] Run database migration `0104_enable_rls_security.sql`
- [ ] Update auth middleware to set RLS context
- [ ] Wrap database queries with RLS context
- [ ] Update tests to account for RLS
- [ ] Verify no cross-tenant data leakage

## Step 1: Run the Migration

```bash
# Development
npm run db:migrate

# Production (after testing in staging!)
npm run db:migrate:prod
```

Verify migration succeeded:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
-- All tables should show rowsecurity = true
```

## Step 2: Update Authentication Middleware

### For tRPC (Recommended)

```typescript
// server/api/context.ts
import { db, getUserOrganizationIds, setRLSContext } from '@dokploy/server/db';
import { auth } from '../lib/auth';

export async function createContext(opts: { req: Request }) {
  const session = await auth.api.getSession({ headers: opts.req.headers });
  
  // Set RLS context if user is authenticated
  if (session?.user?.id) {
    const organizationIds = await getUserOrganizationIds(db, session.user.id);
    await setRLSContext(db, organizationIds);
  }
  
  return {
    db,
    session,
  };
}
```

### For Express/Next.js API Routes

```typescript
// middleware/rls.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { db, getUserOrganizationIds, setRLSContext } from '@dokploy/server/db';
import { auth } from '../lib/auth';

export async function withRLS(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await auth.api.getSession({ headers: req.headers });
    
    if (session?.user?.id) {
      const organizationIds = await getUserOrganizationIds(db, session.user.id);
      await setRLSContext(db, organizationIds);
    }
    
    return handler(req, res);
  };
}
```

## Step 3: Update Service Layer

### Pattern A: Middleware Approach (Recommended)

If you've updated the middleware (Step 2), most queries will automatically respect RLS:

```typescript
// services/project.ts - No changes needed if middleware sets context
export async function findProjectById(projectId: string) {
  return await db.query.projects.findFirst({
    where: eq(projects.projectId, projectId),
  });
}
```

### Pattern B: Explicit Context (More Control)

For services that need explicit control:

```typescript
// services/project.ts
import { withRLSContext, getUserOrganizationIds } from '@dokploy/server/db';

export async function findProjectById(projectId: string, userId: string) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  
  return await withRLSContext(db, organizationIds, async (db) => {
    return await db.query.projects.findFirst({
      where: eq(projects.projectId, projectId),
    });
  });
}
```

## Step 4: Update Common Patterns

### Creating Resources

```typescript
// Before
export async function createProject(data: ProjectInput) {
  return await db.insert(projects).values(data).returning();
}

// After - with middleware
export async function createProject(data: ProjectInput) {
  // RLS context already set by middleware
  // RLS will enforce that organizationId is one user has access to
  return await db.insert(projects).values(data).returning();
}

// After - explicit
export async function createProject(data: ProjectInput, userId: string) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  
  return await withRLSContext(db, organizationIds, async (db) => {
    // Verify organizationId is in user's allowed list
    if (!organizationIds.includes(data.organizationId)) {
      throw new Error('Access denied to organization');
    }
    
    return await db.insert(projects).values(data).returning();
  });
}
```

### Updating Resources

```typescript
// Before
export async function updateProject(projectId: string, data: Partial<Project>) {
  return await db
    .update(projects)
    .set(data)
    .where(eq(projects.projectId, projectId))
    .returning();
}

// After - RLS automatically prevents updating projects not in user's orgs
export async function updateProject(projectId: string, data: Partial<Project>) {
  // RLS context set by middleware
  const result = await db
    .update(projects)
    .set(data)
    .where(eq(projects.projectId, projectId))
    .returning();
  
  if (result.length === 0) {
    throw new Error('Project not found or access denied');
  }
  
  return result[0];
}
```

### Deleting Resources

```typescript
// Before
export async function deleteProject(projectId: string) {
  return await db
    .delete(projects)
    .where(eq(projects.projectId, projectId));
}

// After - RLS prevents deleting projects not in user's orgs
export async function deleteProject(projectId: string) {
  // RLS context set by middleware
  const result = await db
    .delete(projects)
    .where(eq(projects.projectId, projectId))
    .returning();
  
  if (result.length === 0) {
    throw new Error('Project not found or access denied');
  }
  
  return result[0];
}
```

### Transactions

```typescript
// Before
export async function createProjectWithApplication(
  projectData: ProjectInput,
  appData: ApplicationInput
) {
  return await db.transaction(async (tx) => {
    const project = await tx.insert(projects).values(projectData).returning();
    const app = await tx.insert(applications).values({
      ...appData,
      projectId: project[0].projectId,
    }).returning();
    
    return { project, app };
  });
}

// After - with middleware
export async function createProjectWithApplication(
  projectData: ProjectInput,
  appData: ApplicationInput
) {
  // RLS context already set by middleware and carries through transaction
  return await db.transaction(async (tx) => {
    const project = await tx.insert(projects).values(projectData).returning();
    const app = await tx.insert(applications).values({
      ...appData,
      projectId: project[0].projectId,
    }).returning();
    
    return { project, app };
  });
}

// After - explicit
import { withRLSTransaction } from '@dokploy/server/db';

export async function createProjectWithApplication(
  projectData: ProjectInput,
  appData: ApplicationInput,
  userId: string
) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  
  return await withRLSTransaction(db, organizationIds, async (tx) => {
    const project = await tx.insert(projects).values(projectData).returning();
    const app = await tx.insert(applications).values({
      ...appData,
      projectId: project[0].projectId,
    }).returning();
    
    return { project, app };
  });
}
```

## Step 5: Update Tests

### Setup Test Context

```typescript
// test-utils/setup.ts
import { bypassRLS, setRLSContext } from '@dokploy/server/db';

export async function setupTestOrganization() {
  // Use bypassRLS for test setup
  return await bypassRLS(db, async (db) => {
    const org = await db.insert(organization).values({
      name: 'Test Org',
      ownerId: 'test-user',
      createdAt: new Date(),
    }).returning();
    
    return org[0];
  });
}

export async function setTestUserContext(organizationIds: string[]) {
  await setRLSContext(db, organizationIds);
}
```

### Update Existing Tests

```typescript
// Before
describe('Project Service', () => {
  it('should create project', async () => {
    const project = await createProject({
      name: 'Test',
      organizationId: 'org-1',
    });
    
    expect(project).toBeDefined();
  });
});

// After
describe('Project Service', () => {
  let testOrg: Organization;
  
  beforeEach(async () => {
    testOrg = await setupTestOrganization();
    // Set RLS context for test user
    await setTestUserContext([testOrg.id]);
  });
  
  it('should create project', async () => {
    const project = await createProject({
      name: 'Test',
      organizationId: testOrg.id,
    });
    
    expect(project).toBeDefined();
    expect(project.organizationId).toBe(testOrg.id);
  });
  
  it('should not access other organization data', async () => {
    // Create another organization
    const otherOrg = await bypassRLS(db, async (db) => {
      return await db.insert(organization).values({
        name: 'Other Org',
        ownerId: 'other-user',
        createdAt: new Date(),
      }).returning();
    });
    
    // Try to access with current user's context (only has testOrg access)
    const projects = await db.query.projects.findMany({
      where: eq(projects.organizationId, otherOrg[0].id),
    });
    
    // Should return empty array due to RLS
    expect(projects).toHaveLength(0);
  });
});
```

## Step 6: Update API Routes

### tRPC Procedures

```typescript
// Before
export const projectRouter = router({
  getById: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      return await findProjectById(input.projectId);
    }),
});

// After (if middleware sets RLS context)
export const projectRouter = router({
  getById: protectedProcedure  // Ensures user is authenticated
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      // RLS context already set by context creation
      return await findProjectById(input.projectId);
    }),
});
```

### REST API Routes

```typescript
// Before
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { projectId } = req.query;
  const project = await findProjectById(projectId as string);
  res.json(project);
}

// After (with middleware)
import { withRLS } from '../middleware/rls';

export default withRLS(async function handler(req, res) {
  const { projectId } = req.query;
  // RLS context set by middleware
  const project = await findProjectById(projectId as string);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied' });
  }
  
  res.json(project);
});
```

## Step 7: Administrative Operations

For operations that need to bypass RLS (use sparingly!):

```typescript
import { bypassRLS } from '@dokploy/server/db';

export async function adminGetAllProjects() {
  // Only call this from admin-protected routes!
  return await bypassRLS(db, async (db) => {
    return await db.query.projects.findMany();
  });
}

export async function systemMaintenance() {
  // System operations that need access to all data
  return await bypassRLS(db, async (db) => {
    // Cleanup, reporting, etc.
  });
}
```

## Common Migration Issues

### Issue 1: Empty Results After Migration

**Problem**: Queries return empty results after enabling RLS.

**Solution**: Ensure RLS context is set:
```typescript
// Add this before your query
const session = await getSession();
const orgIds = await getUserOrganizationIds(db, session.user.id);
await setRLSContext(db, orgIds);
```

### Issue 2: Tests Failing

**Problem**: Tests fail because they don't set RLS context.

**Solution**: Use `bypassRLS` for test setup or set test context:
```typescript
beforeEach(async () => {
  await bypassRLS(db, async (db) => {
    // Setup test data
  });
  
  // Set context for tests
  await setTestUserContext([testOrgId]);
});
```

### Issue 3: Admin Routes Broken

**Problem**: Admin routes that need to see all data are blocked by RLS.

**Solution**: Use `bypassRLS` for legitimate admin operations:
```typescript
export async function adminHandler(req, res) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const allData = await bypassRLS(db, async (db) => {
    return await db.query.projects.findMany();
  });
  
  res.json(allData);
}
```

## Verification

After migration, verify RLS is working:

```typescript
// Create test script
import { db, setRLSContext, bypassRLS } from '@dokploy/server/db';

async function verifyRLS() {
  // Create test data in different orgs
  const { org1, org2 } = await bypassRLS(db, async (db) => {
    const org1 = await db.insert(organization).values({...}).returning();
    const org2 = await db.insert(organization).values({...}).returning();
    
    await db.insert(projects).values([
      { organizationId: org1[0].id, name: 'Project 1' },
      { organizationId: org2[0].id, name: 'Project 2' },
    ]);
    
    return { org1: org1[0], org2: org2[0] };
  });
  
  // Test org1 user
  await setRLSContext(db, [org1.id]);
  const org1Projects = await db.query.projects.findMany();
  console.log(`Org1 user sees ${org1Projects.length} project(s)`);  // Should be 1
  
  // Test org2 user
  await setRLSContext(db, [org2.id]);
  const org2Projects = await db.query.projects.findMany();
  console.log(`Org2 user sees ${org2Projects.length} project(s)`);  // Should be 1
  
  // Cleanup
  await bypassRLS(db, async (db) => {
    await db.delete(projects);
    await db.delete(organization);
  });
}

verifyRLS();
```

## Rollout Strategy

1. **Development**: Deploy and test thoroughly
2. **Staging**: Deploy and run full test suite
3. **Canary**: Deploy to small subset of production
4. **Production**: Full deployment with monitoring

Monitor for:
- Increased error rates
- Permission denied errors
- Empty result sets
- Performance degradation

## Support

If you encounter issues:
1. Check `packages/server/src/db/RLS_GUIDE.md`
2. Review `packages/server/src/db/INTEGRATION_EXAMPLE.md`
3. Run `npm test -- rls.test.ts` to verify RLS is working
4. Check PostgreSQL logs for RLS violations

## Timeline

- **Week 1**: Run migration in development, update middleware
- **Week 2**: Update service layer and tests
- **Week 3**: Deploy to staging, full testing
- **Week 4**: Deploy to production with monitoring
