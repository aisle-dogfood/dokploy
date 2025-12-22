# Row-Level Security (RLS) Implementation Guide

## Overview

This application implements PostgreSQL Row-Level Security (RLS) to provide database-level multi-tenant isolation. RLS ensures that even if there's a bug in application-layer authorization, users cannot access data from organizations they don't belong to.

## How It Works

### 1. Database Policies

All tables have RLS enabled with policies that check organization membership. The policies use session variables to determine which organizations the current user can access.

### 2. Session Variables

Before executing queries, the application sets a PostgreSQL session variable:
```sql
SET LOCAL app.current_user_organizations = 'org1,org2,org3';
```

### 3. Policy Enforcement

When you query a table, PostgreSQL automatically filters results based on the RLS policies. For example:

```typescript
// This query will automatically only return projects from organizations
// the user has access to, even though no WHERE clause is specified
const projects = await db.query.projects.findMany();
```

## Usage

### Method 1: Using `withRLSContext` (Recommended)

```typescript
import { db } from '@/db';
import { withRLSContext } from '@/db/rls-context';

// Get user's organization IDs (usually from session/auth)
const organizationIds = ['org-id-1', 'org-id-2'];

// Execute queries within RLS context
const result = await withRLSContext(db, organizationIds, async (db) => {
  // All queries here are automatically scoped to these organizations
  const projects = await db.query.projects.findMany();
  const applications = await db.query.applications.findMany();
  
  return { projects, applications };
});
```

### Method 2: Using Helper Functions

```typescript
import { createRLSDatabase } from '@/db/with-rls';

// Create a database instance with RLS context for a user
const dbWithRLS = await createRLSDatabase(userId);
const projects = await dbWithRLS.query.projects.findMany();
```

### Method 3: In tRPC or API Routes

```typescript
import { getRLSDatabaseFromSession } from '@/db/with-rls';

// In your API handler
export async function handler(req, res) {
  const session = await getSession(req);
  const db = await getRLSDatabaseFromSession(session);
  
  // All queries automatically scoped to user's organizations
  const projects = await db.query.projects.findMany();
  
  return res.json(projects);
}
```

### Method 4: Transactions with RLS

```typescript
import { withRLSTransaction } from '@/db/rls-context';

const result = await withRLSTransaction(db, organizationIds, async (tx) => {
  // All operations in this transaction are scoped to these organizations
  const project = await tx.insert(projects).values({...}).returning();
  const app = await tx.insert(applications).values({
    projectId: project[0].projectId,
    ...
  }).returning();
  
  return { project, app };
});
```

## Integration with Existing Code

### Getting User Organization IDs

```typescript
import { getUserOrganizationIds } from '@/db/rls-context';

const organizationIds = await getUserOrganizationIds(db, userId);
```

### In Authentication Middleware

```typescript
import { setRLSContext } from '@/db/rls-context';

// After user authentication
const session = await auth.getSession();
if (session?.user) {
  const orgIds = await getUserOrganizationIds(db, session.user.id);
  await setRLSContext(db, orgIds);
}
```

## Administrative Operations

For system-level operations that need to bypass RLS (use with caution!):

```typescript
import { bypassRLS } from '@/db/rls-context';

// WARNING: This disables RLS protections!
await bypassRLS(db, async (db) => {
  // System-level operations here
  const allProjects = await db.query.projects.findMany();
});
```

## Migration Path

To migrate existing code:

1. **Identify query locations**: Find all places where database queries are executed
2. **Determine user context**: Ensure you have access to the current user's session
3. **Wrap with RLS context**: Use `withRLSContext` or helper functions
4. **Test thoroughly**: Verify that users can only access their data

### Example Migration

**Before:**
```typescript
export async function getProjects() {
  return await db.query.projects.findMany();
}
```

**After:**
```typescript
export async function getProjects(userId: string) {
  const organizationIds = await getUserOrganizationIds(db, userId);
  return await withRLSContext(db, organizationIds, async (db) => {
    return await db.query.projects.findMany();
  });
}
```

## Performance Considerations

1. **Indexes**: The migration creates indexes on foreign keys used in RLS policies
2. **Session Variables**: Setting session variables is fast (microseconds)
3. **Policy Evaluation**: Policies use indexed columns for efficient filtering
4. **Connection Pooling**: Each connection maintains its own session variables

## Security Best Practices

1. **Always set RLS context**: Never execute queries without setting the organization context (except for public data)
2. **Validate organization access**: Even with RLS, validate that users should perform operations
3. **Audit logging**: Log cross-organization access attempts for security monitoring
4. **Review policies**: Regularly review RLS policies to ensure they're correct
5. **Test isolation**: Write tests that verify users cannot access other organizations' data

## Testing RLS

```typescript
describe('RLS Isolation', () => {
  it('should only return projects from user organizations', async () => {
    const user1Orgs = ['org1'];
    const user2Orgs = ['org2'];
    
    // Create projects in different organizations
    await bypassRLS(db, async (db) => {
      await db.insert(projects).values([
        { organizationId: 'org1', name: 'Project 1' },
        { organizationId: 'org2', name: 'Project 2' },
      ]);
    });
    
    // User 1 should only see org1 projects
    const user1Projects = await withRLSContext(db, user1Orgs, async (db) => {
      return await db.query.projects.findMany();
    });
    expect(user1Projects).toHaveLength(1);
    expect(user1Projects[0].organizationId).toBe('org1');
    
    // User 2 should only see org2 projects
    const user2Projects = await withRLSContext(db, user2Orgs, async (db) => {
      return await db.query.projects.findMany();
    });
    expect(user2Projects).toHaveLength(1);
    expect(user2Projects[0].organizationId).toBe('org2');
  });
});
```

## Troubleshooting

### No results returned
- Check that RLS context is set correctly
- Verify the user is a member of the expected organizations
- Use `bypassRLS` temporarily to verify data exists

### Performance issues
- Ensure indexes are created (migration includes them)
- Check query plans: `EXPLAIN ANALYZE SELECT ...`
- Consider materialized views for complex queries

### RLS not enforced
- Verify RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'your_table';`
- Check policies exist: `SELECT * FROM pg_policies WHERE tablename = 'your_table';`
- Ensure session variables are set: `SHOW app.current_user_organizations;`

## Further Reading

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Multi-tenancy Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/multi-tenancy)
