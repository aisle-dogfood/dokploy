# RLS Integration Examples

This document provides concrete examples of how to integrate Row-Level Security with the existing codebase.

## Integration with Auth Middleware

### Example 1: tRPC Context

```typescript
// In your tRPC context setup (e.g., server/api/context.ts)
import { db, getUserOrganizationIds, setRLSContext } from '@dokploy/server/db';

export async function createContext(opts: CreateContextOptions) {
  const session = await auth.api.getSession({ headers: opts.req.headers });
  
  if (session?.user?.id) {
    // Set RLS context for this request
    const organizationIds = await getUserOrganizationIds(db, session.user.id);
    await setRLSContext(db, organizationIds);
  }
  
  return {
    db,
    session,
  };
}
```

### Example 2: Express/Next.js Middleware

```typescript
// In your API middleware
import { NextApiRequest, NextApiResponse } from 'next';
import { db, getUserOrganizationIds, setRLSContext } from '@dokploy/server/db';
import { getSession } from './auth';

export async function withRLS(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getSession(req);
    
    if (session?.user?.id) {
      const organizationIds = await getUserOrganizationIds(db, session.user.id);
      await setRLSContext(db, organizationIds);
    }
    
    return handler(req, res);
  };
}

// Usage in API route:
export default withRLS(async (req, res) => {
  const projects = await db.query.projects.findMany();
  res.json(projects);
});
```

## Integration with Existing Services

### Example 1: Project Service

```typescript
// Before (packages/server/src/services/project.ts)
export async function findProjectById(projectId: string) {
  return await db.query.projects.findFirst({
    where: eq(projects.projectId, projectId),
  });
}

// After
import { withRLSContext } from '@dokploy/server/db';

export async function findProjectById(
  projectId: string,
  userId: string
) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  return await withRLSContext(db, organizationIds, async (db) => {
    return await db.query.projects.findFirst({
      where: eq(projects.projectId, projectId),
    });
  });
}
```

### Example 2: Application Service

```typescript
// packages/server/src/services/application.ts
import { db, withRLSContext, getUserOrganizationIds } from '@dokploy/server/db';

export async function createApplication(
  data: CreateApplicationInput,
  userId: string
) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  
  return await withRLSContext(db, organizationIds, async (db) => {
    // Verify the project exists and user has access (RLS will enforce this)
    const project = await db.query.projects.findFirst({
      where: eq(projects.projectId, data.projectId),
    });
    
    if (!project) {
      throw new Error('Project not found or access denied');
    }
    
    // Create application - RLS ensures it's in an accessible project
    return await db.insert(applications).values(data).returning();
  });
}

export async function findApplicationsByProject(
  projectId: string,
  userId: string
) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  
  return await withRLSContext(db, organizationIds, async (db) => {
    return await db.query.applications.findMany({
      where: eq(applications.projectId, projectId),
    });
  });
}
```

## Integration with Better-Auth

Since this project uses better-auth, here's how to integrate RLS:

```typescript
// In your auth configuration or middleware
import { auth } from './lib/auth';
import { db, setRLSContext } from '@dokploy/server/db';
import { eq } from 'drizzle-orm';
import { member } from './db/schema';

// Helper to get user's organizations from better-auth session
export async function setRLSContextFromSession(
  session: { user?: { id: string } }
) {
  if (!session.user?.id) {
    return;
  }
  
  // Get user's organization memberships
  const memberships = await db.query.member.findMany({
    where: eq(member.userId, session.user.id),
    columns: {
      organizationId: true,
    },
  });
  
  const organizationIds = memberships.map(m => m.organizationId);
  await setRLSContext(db, organizationIds);
}

// Use in API routes:
export async function apiHandler(req, res) {
  const session = await auth.api.getSession({ headers: req.headers });
  await setRLSContextFromSession(session);
  
  // Now all queries are scoped to user's organizations
  const projects = await db.query.projects.findMany();
  res.json(projects);
}
```

## Gradual Migration Strategy

If you want to migrate gradually without breaking existing code:

### Step 1: Create RLS-aware versions of services

```typescript
// New file: packages/server/src/services/project-rls.ts
import { withRLSContext, getUserOrganizationIds } from '@dokploy/server/db';
import * as projectService from './project';

export async function findProjectById(projectId: string, userId: string) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  return await withRLSContext(db, organizationIds, async (db) => {
    return await projectService.findProjectById(projectId);
  });
}

// Export all other functions wrapped with RLS
```

### Step 2: Update API routes one at a time

```typescript
// Before
import * as projectService from './services/project';

export async function handler(req, res) {
  const project = await projectService.findProjectById(req.query.id);
  res.json(project);
}

// After
import * as projectService from './services/project-rls';

export async function handler(req, res) {
  const session = await getSession(req);
  const project = await projectService.findProjectById(
    req.query.id,
    session.user.id
  );
  res.json(project);
}
```

### Step 3: Eventually replace old services

Once all routes are migrated, replace the old service implementations with RLS-aware ones.

## Testing Your Integration

```typescript
import { describe, it, expect } from 'vitest';
import { db, withRLSContext } from '@dokploy/server/db';

describe('RLS Integration', () => {
  it('should prevent cross-organization access in API', async () => {
    // Create test data
    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();
    const user1 = await createTestUser({ organizationIds: [org1.id] });
    
    // Try to access org2's projects as user1
    const projects = await withRLSContext(
      db,
      [org1.id],
      async (db) => {
        return await db.query.projects.findMany();
      }
    );
    
    // Should not include org2 projects
    expect(projects.every(p => p.organizationId === org1.id)).toBe(true);
  });
});
```

## Common Patterns

### Pattern 1: Request-scoped RLS

```typescript
// Set RLS once per request in middleware
app.use(async (req, res, next) => {
  const session = await getSession(req);
  if (session?.user) {
    const orgIds = await getUserOrganizationIds(db, session.user.id);
    await setRLSContext(db, orgIds);
  }
  next();
});
```

### Pattern 2: Function-scoped RLS

```typescript
// Set RLS per function call
export async function sensitiveOperation(userId: string) {
  return await withRLSContext(
    db,
    await getUserOrganizationIds(db, userId),
    async (db) => {
      // Operation here
    }
  );
}
```

### Pattern 3: Transaction with RLS

```typescript
import { withRLSTransaction } from '@dokploy/server/db';

export async function createProjectWithResources(
  data: ProjectInput,
  userId: string
) {
  const orgIds = await getUserOrganizationIds(db, userId);
  
  return await withRLSTransaction(db, orgIds, async (tx) => {
    const project = await tx.insert(projects).values(data).returning();
    const app = await tx.insert(applications).values({
      projectId: project[0].projectId,
      ...appData
    }).returning();
    
    return { project, app };
  });
}
```

## Troubleshooting

### Issue: No data returned after enabling RLS

**Solution:** Ensure RLS context is set before querying:

```typescript
// ❌ Wrong
const projects = await db.query.projects.findMany();

// ✅ Correct
const organizationIds = await getUserOrganizationIds(db, userId);
await setRLSContext(db, organizationIds);
const projects = await db.query.projects.findMany();

// ✅ Or use wrapper
const projects = await withRLSContext(db, organizationIds, async (db) => {
  return await db.query.projects.findMany();
});
```

### Issue: RLS blocking legitimate admin operations

**Solution:** Use `bypassRLS` for admin operations:

```typescript
import { bypassRLS } from '@dokploy/server/db';

export async function adminDeleteAllProjects() {
  // Only allow for actual admins!
  if (!isAdmin(user)) {
    throw new Error('Unauthorized');
  }
  
  return await bypassRLS(db, async (db) => {
    return await db.delete(projects);
  });
}
```
