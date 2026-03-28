# Database Migration Guide for Encryption

This guide explains the database migration strategy for encrypting existing plaintext secrets.

## Migration Strategy

The encryption implementation uses **backward compatibility** to ensure a smooth transition:

1. **New data** is automatically encrypted/hashed when created
2. **Existing plaintext data** remains readable until migrated
3. **Migration script** can be run at any time (safe to run multiple times)
4. **No downtime** required during migration

## How Backward Compatibility Works

### For Encrypted Fields (AES-256-GCM)

The decryption function checks if data is already encrypted:

```typescript
export const decryptSecret = (ciphertext: string): string => {
  // Check if data is in encrypted format (contains colons)
  if (!ciphertext.includes(":")) {
    // Data is plaintext (legacy), return as-is
    return ciphertext;
  }
  
  // Data is encrypted, decrypt it
  // ... decryption logic ...
};
```

**Format detection:**
- Encrypted: `iv:authTag:ciphertext` (hex-encoded with colons)
- Plaintext: Any string without colons (legacy data)

### For Hashed Passwords (bcrypt)

The system can detect bcrypt hashes:

```typescript
export const isBcryptHash = (str: string): boolean => {
  // Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(str);
};
```

**Password handling:**
- For authentication: Use `verifyPassword()` which handles both plaintext (temporarily) and hashed passwords
- After migration: All passwords are hashed, plaintext comparison fails (forcing password reset if needed)

## Migration Steps

### 1. Pre-Migration Checklist

- [ ] Back up your database
- [ ] Generate and securely store encryption key
- [ ] Set `ENCRYPTION_KEY` environment variable
- [ ] Test in non-production environment first
- [ ] Document the encryption key location

### 2. Deploy Application

```bash
# Set the encryption key
export ENCRYPTION_KEY=$(openssl rand -hex 32)

# Deploy the application
# The app will start accepting encrypted data but can still read plaintext
```

### 3. Run Migration Script

```bash
cd packages/server
pnpm tsx scripts/migrate-encrypt-secrets.ts
```

**What it does:**
- Scans all tables for plaintext secrets
- Encrypts/hashes them using the configured key
- Skips already encrypted/hashed data
- Provides progress output

**Example output:**
```
🚀 Starting secret encryption migration...

🔐 Migrating destinations (S3 secret access keys)...
  ✅ Migrated 5 destinations, skipped 0 already encrypted

🔐 Migrating registry passwords...
  ✅ Migrated 3 registries, skipped 0 already hashed

...

✅ Migration completed successfully!

⚠️  IMPORTANT: Make sure to back up your ENCRYPTION_KEY securely!
```

### 4. Verify Migration

```bash
# Check that encrypted data can be decrypted
# Try accessing a destination, registry, etc. through the UI
```

### 5. Post-Migration

- [ ] Verify all services work correctly
- [ ] Back up the encryption key separately from database
- [ ] Update documentation with key location
- [ ] Schedule regular key rotation (e.g., annually)

## No SQL Schema Changes Required

**Important:** No database schema changes are required because:

1. Encrypted data fits in existing `text` columns
2. bcrypt hashes fit in existing password columns (60 characters)
3. The application layer handles encryption/decryption transparently

## Rollback Procedure

If you need to rollback:

### Option 1: Restore from Backup (Recommended)

```bash
# Restore database from pre-migration backup
pg_restore -d dokploy backup_before_encryption.sql
```

### Option 2: Decrypt in Place (Advanced)

If you have the encryption key, you could write a reverse migration script:

```typescript
// NOT PROVIDED - would need custom implementation
// This would decrypt all encrypted fields back to plaintext
// Only use if absolutely necessary
```

## Testing the Migration

### In Development

1. Create test data with various secret types
2. Run the migration script
3. Verify data can still be accessed
4. Create new records and verify they're encrypted

### In Staging

1. Clone production database
2. Set test encryption key
3. Run migration
4. Perform full functionality testing
5. Load test to ensure performance is acceptable

### Sample Test Cases

```typescript
// Test 1: Create new destination
// Expected: secretAccessKey is encrypted in DB
await createDestination({
  name: "Test S3",
  secretAccessKey: "test-secret-123",
  // ...
});

// Test 2: Read destination
// Expected: secretAccessKey is decrypted correctly
const dest = await findDestinationById(id);
assert(dest.secretAccessKey === "test-secret-123");

// Test 3: Update destination
// Expected: New secretAccessKey is encrypted
await updateDestination(id, {
  secretAccessKey: "new-secret-456",
});

// Test 4: Password authentication
// Expected: Hashed password verifies correctly
const valid = await verifyPassword("mypassword", hashedPassword);
assert(valid === true);
```

## Performance Considerations

### Encryption Overhead

- **AES-256-GCM**: ~1-2ms per encrypt/decrypt operation
- **bcrypt (cost 12)**: ~100-300ms per hash/verify operation

### Recommendations

1. **Cache decrypted values** in memory when possible (be careful with security)
2. **Batch operations** to minimize overhead
3. **Use connection pooling** to reduce database query overhead
4. **Monitor performance** after migration

### Expected Impact

- Secret reads: +1-2ms per operation
- Password authentication: +100-300ms per login
- Database size: Minimal increase (~10-20% for encrypted fields)

## Troubleshooting

### Migration Script Fails

**Error:** `ENCRYPTION_KEY environment variable is not set`
- **Solution:** Set the encryption key: `export ENCRYPTION_KEY=$(openssl rand -hex 32)`

**Error:** `Failed to encrypt secret`
- **Solution:** Check that encryption key is valid 64-character hex string

### After Migration

**Error:** `Failed to decrypt secret`
- **Solution:** Verify you're using the same encryption key that was used for migration

**Error:** Passwords don't work
- **Solution:** Users may need to reset passwords if migration couldn't complete for some passwords

## Security Notes

1. **Never log the encryption key** - ensure it's not in logs or error messages
2. **Rotate the key periodically** - plan for annual key rotation
3. **Separate key storage** - don't store key in same location as database backups
4. **Monitor failed decryption attempts** - could indicate key mismatch or attacks
5. **Audit access to secrets** - log when secrets are accessed

## Support

If you encounter issues during migration:

1. Check the migration script output for specific errors
2. Verify encryption key is set and valid
3. Ensure database connection is working
4. Review logs for detailed error messages
5. Contact support if issues persist

## Migration Checklist

```markdown
- [ ] Production database backed up
- [ ] Encryption key generated and stored securely
- [ ] ENCRYPTION_KEY environment variable set
- [ ] Tested in development environment
- [ ] Tested in staging environment
- [ ] Migration script reviewed
- [ ] Rollback procedure documented
- [ ] Team notified of maintenance window
- [ ] Migration script executed
- [ ] Services verified working
- [ ] Encryption key backed up separately
- [ ] Documentation updated
- [ ] Monitoring configured
```
