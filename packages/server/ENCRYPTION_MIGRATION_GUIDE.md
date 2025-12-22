# Encryption Migration Guide

This guide explains how to migrate existing Dokploy installations to use encrypted storage for sensitive data.

## ⚠️ Important Warnings

1. **BACKUP YOUR DATABASE** before proceeding with this migration
2. This is a **one-way migration** - once data is encrypted, you need the key to decrypt it
3. Test this migration in a **non-production environment** first
4. The **ENCRYPTION_KEY must be kept secure** and backed up separately
5. **Loss of the encryption key means permanent loss of encrypted data**

## Prerequisites

- Dokploy installation with existing data
- Database backup
- Node.js environment with access to the database
- Ability to set environment variables

## Step-by-Step Migration Process

### Step 1: Generate an Encryption Key

Generate a secure 256-bit (32 bytes) encryption key:

```bash
openssl rand -hex 32
```

This will output a 64-character hexadecimal string. **Save this key securely!**

### Step 2: Secure the Encryption Key

Store the encryption key in a secure location:

1. **Production**: Use a secrets management system:
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - GCP Secret Manager

2. **Development/Testing**: Use environment variables:
   ```bash
   export ENCRYPTION_KEY="your_64_character_hex_string_here"
   ```

3. **Docker**: Add to your docker-compose.yml or environment file:
   ```yaml
   environment:
     - ENCRYPTION_KEY=your_64_character_hex_string_here
   ```

### Step 3: Backup Your Database

**CRITICAL**: Create a complete backup before proceeding:

```bash
# PostgreSQL backup
pg_dump -U postgres -d dokploy > dokploy_backup_$(date +%Y%m%d_%H%M%S).sql

# Or using Docker
docker exec postgres_container pg_dump -U postgres dokploy > dokploy_backup.sql
```

Verify the backup is complete and can be restored.

### Step 4: Stop the Application (Optional but Recommended)

To prevent data inconsistencies during migration:

```bash
# If using Docker
docker-compose stop dokploy

# If using systemd
systemctl stop dokploy
```

### Step 5: Run the Migration Script

Navigate to the server package directory and run the migration:

```bash
cd packages/server

# Set the encryption key if not already set
export ENCRYPTION_KEY="your_64_character_hex_string_here"

# Run the migration script
npm run migrate:encryption
# OR
pnpm migrate:encryption
# OR manually:
node -r esbuild-register src/utils/migrate-encryption.ts
```

The script will:
- Check if the ENCRYPTION_KEY is set
- Detect which values are already encrypted (safe for re-running)
- Encrypt plaintext sensitive data across all tables
- Provide a detailed summary of processed records and errors

### Step 6: Review Migration Results

The script outputs a detailed summary:

```
📊 MIGRATION SUMMARY
============================================================

certificate:
  ✅ Records processed: 5
  
ssh-key:
  ✅ Records processed: 3

registry:
  ✅ Records processed: 2
  
...

============================================================
Total records encrypted: 150
Total errors: 0
============================================================

✅ Migration completed successfully!
```

If there are errors:
1. Review the error messages
2. Fix issues manually if needed
3. Re-run the migration (it skips already encrypted values)

### Step 7: Update Application Configuration

Ensure the ENCRYPTION_KEY is set in your application's runtime environment:

**Docker Compose:**
```yaml
services:
  dokploy:
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
```

**Systemd Service:**
```ini
[Service]
Environment="ENCRYPTION_KEY=your_key_here"
```

**PM2 Ecosystem:**
```javascript
module.exports = {
  apps: [{
    name: 'dokploy',
    env: {
      ENCRYPTION_KEY: 'your_key_here'
    }
  }]
}
```

### Step 8: Start the Application

```bash
# Docker
docker-compose up -d dokploy

# Systemd
systemctl start dokploy
```

### Step 9: Verify Functionality

1. **Check Logs**: Monitor for any decryption errors
   ```bash
   docker-compose logs -f dokploy
   ```

2. **Test Functionality**:
   - View existing certificates and SSH keys
   - Connect to databases
   - Test Git provider integrations
   - Verify notifications work
   - Deploy an application

3. **API Testing**: Test key endpoints:
   - GET /api/certificates
   - GET /api/registry
   - GET /api/database/mysql (or postgres, etc.)

### Step 10: Secure Cleanup

1. **Remove plaintext backups** from insecure locations
2. **Encrypt backup files** containing the old plaintext data
3. **Document the encryption key location** for disaster recovery
4. **Set up key rotation schedule** (recommended: annually)

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable is not set"

**Solution**: Set the environment variable before running the migration:
```bash
export ENCRYPTION_KEY="your_64_character_hex_string_here"
```

### Error: "ENCRYPTION_KEY must be a 64-character hex string"

**Solution**: Generate a proper key:
```bash
openssl rand -hex 32
```
Ensure no extra spaces or newlines.

### Error: "Failed to decrypt data"

**Cause**: Wrong encryption key being used or corrupted data.

**Solution**:
1. Verify the correct ENCRYPTION_KEY is set
2. Restore from backup if data is corrupted
3. Check application logs for more details

### Migration Appears Stuck

**Solution**:
1. Check database connectivity
2. Review database locks (PostgreSQL: `SELECT * FROM pg_locks;`)
3. Ensure sufficient database resources

### Values Already Encrypted

The migration script automatically detects encrypted values and skips them. You can safely re-run the migration.

## Rolling Back

If you need to roll back the migration:

### Option 1: Restore from Backup (Recommended)

```bash
# Stop the application
docker-compose stop dokploy

# Restore the backup
psql -U postgres -d dokploy < dokploy_backup.sql

# Start with the old configuration (without ENCRYPTION_KEY)
docker-compose up -d
```

### Option 2: Manual Decryption (Not Recommended)

Create a script to decrypt and restore plaintext values. This is complex and error-prone.

## Key Rotation

To rotate the encryption key:

1. **Generate a new key**: `openssl rand -hex 32`
2. **Create a migration script** that:
   - Decrypts data with the old key
   - Encrypts with the new key
   - Updates all records
3. **Test thoroughly** in a non-production environment
4. **Update environment** with the new key

## Production Checklist

- [ ] Database backup created and verified
- [ ] Encryption key generated and securely stored
- [ ] Key backed up in separate secure location
- [ ] Migration tested in staging environment
- [ ] Application downtime window scheduled (if needed)
- [ ] Monitoring and alerting configured
- [ ] Rollback plan documented and tested
- [ ] Team members notified of the change
- [ ] Post-migration verification steps prepared
- [ ] Encryption key location documented for disaster recovery

## Support

If you encounter issues:

1. Check application logs for detailed error messages
2. Review the migration summary for specific table errors
3. Verify database connectivity and permissions
4. Ensure the ENCRYPTION_KEY is correctly set
5. Test with a small subset of data first

## Security Best Practices

1. **Never commit the encryption key to version control**
2. **Use a secrets management system** in production
3. **Rotate keys periodically** (recommended: annually)
4. **Backup the key separately** from the database backup
5. **Limit access** to the encryption key
6. **Monitor** for unauthorized access to encrypted data
7. **Audit** encryption/decryption operations
8. **Document** key management procedures

## Additional Resources

- See [ENCRYPTION_SETUP.md](../../ENCRYPTION_SETUP.md) for technical details
- Review source code: `src/utils/encryption.ts`
- Migration script: `src/utils/migrate-encryption.ts`
