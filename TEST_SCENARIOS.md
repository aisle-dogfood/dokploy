# Test Scenarios for Rollback Cascade Fix

## Test Scenario 1: Deployment Deletion Does Not Cascade to Rollback
**Setup:**
1. Create a deployment
2. Create a rollback from that deployment
3. Verify rollback has deploymentId pointing to the deployment

**Action:**
- Delete the deployment

**Expected Result:**
- Deployment is deleted
- Rollback still exists
- Rollback.deploymentId is set to NULL
- No errors occur

**SQL Verification:**
```sql
SELECT * FROM rollback WHERE deploymentId IS NULL;
```

## Test Scenario 2: Rollback Deletion Does Not Cascade to Deployment
**Setup:**
1. Create a deployment from a rollback
2. Verify deployment has rollbackId pointing to the rollback

**Action:**
- Delete the rollback

**Expected Result:**
- Rollback is deleted
- Deployment still exists
- Deployment.rollbackId is set to NULL
- No errors occur

**SQL Verification:**
```sql
SELECT * FROM deployment WHERE rollbackId IS NULL;
```

## Test Scenario 3: Creating Rollback Requires DeploymentId
**Setup:**
- Prepare to create a rollback

**Action:**
- Attempt to create a rollback without deploymentId
- Attempt to create a rollback with null deploymentId
- Attempt to create a rollback with empty string deploymentId

**Expected Result:**
- All attempts fail with validation error
- Error message indicates deploymentId is required

## Test Scenario 4: Performing Rollback with Orphaned Record
**Setup:**
1. Create a deployment
2. Create a rollback from that deployment
3. Delete the source deployment
4. Verify rollback.deploymentId is NULL

**Action:**
- Attempt to perform a rollback using the orphaned rollback record

**Expected Result:**
- Operation fails with error "Rollback has no associated deployment"
- No database corruption occurs

## Test Scenario 5: Removing Rollback with Orphaned Record
**Setup:**
1. Create a deployment
2. Create a rollback from that deployment with an image
3. Delete the source deployment
4. Verify rollback.deploymentId is NULL

**Action:**
- Attempt to remove the orphaned rollback record

**Expected Result:**
- Operation catches the error gracefully
- Error is logged but doesn't crash the application
- Rollback record is cleaned up appropriately

## Test Scenario 6: Normal Workflow Still Works
**Setup:**
- Start with clean state

**Action:**
1. Create an application
2. Create a deployment
3. Create a rollback from the deployment
4. Create a new deployment from the rollback
5. Perform the rollback operation

**Expected Result:**
- All operations succeed
- No regressions in functionality
- Data integrity is maintained

## Test Scenario 7: Cleanup Still Works
**Setup:**
1. Create multiple deployments (>10) for an application
2. Some deployments have associated rollbacks

**Action:**
- Trigger the cleanup process that removes old deployments

**Expected Result:**
- Old deployments are removed
- Associated rollbacks are removed via manual cleanup call
- No cascade deletion errors
- Newer deployments remain intact

## Test Scenario 8: Database Migration
**Setup:**
- Existing database with deployment and rollback records

**Action:**
- Run migration 0104_fix_rollback_cascade.sql

**Expected Result:**
- Migration completes successfully
- Existing data is preserved
- rollback.deploymentId column is now nullable
- Foreign key constraints are updated to SET NULL
- No data loss occurs

## Manual SQL Tests

### Test Foreign Key Behavior
```sql
-- Test 1: Delete deployment, rollback survives
BEGIN;
INSERT INTO deployment (deploymentId, title, logPath) VALUES ('test-dep-1', 'Test', '/log/test');
INSERT INTO rollback (rollbackId, deploymentId) VALUES ('test-rb-1', 'test-dep-1');
DELETE FROM deployment WHERE deploymentId = 'test-dep-1';
SELECT * FROM rollback WHERE rollbackId = 'test-rb-1';
-- Should show deploymentId = NULL
ROLLBACK;

-- Test 2: Delete rollback, deployment survives
BEGIN;
INSERT INTO rollback (rollbackId, deploymentId) VALUES ('test-rb-2', NULL);
INSERT INTO deployment (deploymentId, title, logPath, rollbackId) VALUES ('test-dep-2', 'Test', '/log/test', 'test-rb-2');
DELETE FROM rollback WHERE rollbackId = 'test-rb-2';
SELECT * FROM deployment WHERE deploymentId = 'test-dep-2';
-- Should show rollbackId = NULL
ROLLBACK;
```

## API/Service Tests

### Test createRollback validation
```typescript
// Should fail
await createRollback({
  appName: 'test-app',
  // missing deploymentId
});

// Should fail
await createRollback({
  appName: 'test-app',
  deploymentId: '',
});

// Should succeed
await createRollback({
  appName: 'test-app',
  deploymentId: 'valid-deployment-id',
});
```

### Test rollback operation with null deploymentId
```typescript
// Setup: Create rollback, then delete its deployment
const rollback = await createRollback({ ... });
await removeDeployment(rollback.deploymentId);

// This should fail gracefully
try {
  await rollback(rollback.rollbackId);
} catch (error) {
  // Should get "Rollback has no associated deployment"
}
```
