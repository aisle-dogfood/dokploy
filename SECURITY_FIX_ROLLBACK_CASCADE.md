# Security Fix: Mutual ON DELETE CASCADE Between Deployment and Rollback

## Vulnerability Description
The database schema had a mutual ON DELETE CASCADE relationship between the `deployment` and `rollback` tables, which created a risk of unintended data loss:

- `deployment.rollbackId → rollback` with ON DELETE CASCADE
- `rollback.deploymentId → deployment` with ON DELETE CASCADE

This mutual cascade meant that deleting either a deployment or a rollback could trigger a cascade deletion of the other, potentially leading to unintended data loss.

## Changes Made

### 1. Schema Changes

#### `packages/server/src/db/schema/rollbacks.ts`
- Changed `deploymentId` field to be nullable (removed `.notNull()`)
- Changed foreign key constraint from `onDelete: "cascade"` to `onDelete: "set null"`

This ensures that when a deployment is deleted, the associated rollback records are preserved with their `deploymentId` set to null (preserving historical snapshots).

#### `packages/server/src/db/schema/deployment.ts`
- Changed `rollbackId` foreign key constraint from `onDelete: "cascade"` to `onDelete: "set null"`

This ensures that when a rollback is deleted, deployments created from that rollback are preserved with their `rollbackId` set to null.

### 2. Service Layer Safeguards

#### `packages/server/src/services/rollbacks.ts`
Added null checks for `deploymentId` in three functions:
- `createRollback()`: Validates that `deploymentId` is present when creating a new rollback
- `removeRollbackById()`: Checks for null `deploymentId` before attempting to find the deployment
- `rollback()`: Validates `deploymentId` is present before performing rollback operation

#### `packages/server/src/db/schema/rollbacks.ts`
Updated validation schema:
- `createRollbackSchema`: Explicitly requires `deploymentId` to be non-empty string when creating rollbacks

### 3. Database Migration

#### `apps/dokploy/drizzle/0104_fix_rollback_cascade.sql`
Created new migration that:
1. Makes `rollback.deploymentId` nullable
2. Updates foreign key constraint for `rollback.deploymentId` to use SET NULL
3. Updates foreign key constraint for `deployment.rollbackId` to use SET NULL

#### `apps/dokploy/drizzle/meta/_journal.json`
Added migration entry for the new migration file.

## Impact

### Positive Effects
- **Prevents Data Loss**: Deleting a deployment no longer cascades to delete rollback snapshots
- **Preserves History**: Rollback records are historical snapshots and now persist even if source deployment is deleted
- **Safer Deletions**: Deleting a rollback no longer affects deployments created from it
- **Service Layer Protection**: Added validation ensures null values are handled appropriately

### Breaking Changes
- Rollback records can now have null `deploymentId` (but only if the source deployment was deleted)
- When creating new rollbacks, `deploymentId` is still required
- Existing code that assumes `deploymentId` is always non-null may need updates

## Testing Recommendations

1. **Test deployment deletion**: Verify that deleting a deployment sets rollback.deploymentId to null without deleting the rollback
2. **Test rollback deletion**: Verify that deleting a rollback sets deployment.rollbackId to null without deleting the deployment
3. **Test rollback creation**: Verify that creating a rollback still requires a valid deploymentId
4. **Test rollback execution**: Verify that performing a rollback operation works correctly
5. **Test cleanup logic**: Verify that the existing cleanup code in deployment service still works correctly

## Migration Instructions

1. Apply the schema changes (already done in this PR)
2. Run the database migration:
   ```bash
   npm run db:migrate
   ```
3. Optionally regenerate Drizzle snapshots:
   ```bash
   npm run db:generate
   ```

## Related Files Modified

- `packages/server/src/db/schema/rollbacks.ts`
- `packages/server/src/db/schema/deployment.ts`
- `packages/server/src/services/rollbacks.ts`
- `apps/dokploy/drizzle/0104_fix_rollback_cascade.sql`
- `apps/dokploy/drizzle/meta/_journal.json`
