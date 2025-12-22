# Security Password Hashing Migration Guide

## Overview

This guide describes how to migrate existing plaintext passwords in the `security` table to bcrypt hashes.

## Background

Previously, the `security.password` field was stored as plaintext in the database, even though Traefik middleware used bcrypt hashes. This created a security vulnerability where passwords were:
- Stored in plaintext at rest
- Exposed through API responses
- Visible in UI components

## Changes Made

1. **Password Storage**: All passwords are now hashed with bcrypt (10 rounds) before being stored in the database
2. **API Security**: Password fields are masked (returned as empty strings) when reading security records
3. **UI Updates**: Password fields show masked values and require new passwords when updating
4. **Traefik Integration**: Uses the stored bcrypt hash directly instead of re-hashing

## Migration Steps

### For New Installations
No migration needed - passwords will be automatically hashed on creation.

### For Existing Installations

1. **Backup your database** before running any migration:
   ```bash
   # Example for PostgreSQL
   pg_dump -U your_user -d your_database > backup.sql
   ```

2. **Deploy the updated code** with the password hashing changes

3. **Run the migration script** to hash existing plaintext passwords:
   ```bash
   # From the repository root
   node --require esbuild-register packages/server/scripts/hash-existing-passwords.ts
   ```

4. **Verify the migration**:
   - Check that all password fields in the `security` table now start with `$2a$`, `$2b$`, or `$2y$` (bcrypt hash prefixes)
   - Test that existing basic auth credentials still work
   - Verify that the UI shows masked passwords

## Post-Migration

After migration:
- All new passwords will be automatically hashed
- Password updates will hash the new password
- Passwords are never returned in API responses (empty string instead)
- UI displays masked password values
- Users must enter a new password when updating security records (passwords can't be pre-filled)

## Rollback

If you need to rollback this change (NOT RECOMMENDED - only for emergencies):

1. Restore from your database backup
2. Revert to the previous code version

**Warning**: Rolling back means passwords will be stored in plaintext again, which is a security risk.

## Security Considerations

- **Password Strength**: Ensure users are creating strong passwords for basic auth
- **RBAC**: Strict role-based access control should be enforced on the security table
- **Audit Logging**: Consider implementing audit logs for security record access and modifications
- **Rotation**: Encourage regular password rotation for basic auth credentials
