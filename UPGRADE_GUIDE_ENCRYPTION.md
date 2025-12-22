# Upgrade Guide: Encryption for Sensitive Data

This guide will help you upgrade to the version with application-layer encryption for sensitive data.

## Prerequisites

- Dokploy instance with database access
- Ability to set environment variables
- `openssl` command-line tool (or alternative random key generator)

## Step-by-Step Upgrade

### Step 1: Generate Encryption Key

Before upgrading, generate a secure encryption key:

```bash
openssl rand -hex 32
```

**Save this key securely!** You will need it for the upgrade and for all future operations.

### Step 2: Backup Your Data

**IMPORTANT**: Before proceeding, backup your database:

```bash
# PostgreSQL backup
pg_dump -U dokploy -h localhost dokploy > dokploy_backup_$(date +%Y%m%d).sql

# Or use your existing backup solution
```

Also backup your current `.env` file:

```bash
cp .env .env.backup
```

### Step 3: Set Encryption Key

Add the encryption key to your environment configuration:

#### For Docker Deployments:

Edit your docker-compose.yml or environment file:

```yaml
environment:
  - ENCRYPTION_KEY=your_64_character_hex_string_here
```

#### For Direct Deployments:

Add to `.env` file:

```bash
ENCRYPTION_KEY=your_64_character_hex_string_here
```

Or export as environment variable:

```bash
export ENCRYPTION_KEY=your_64_character_hex_string_here
```

### Step 4: Deploy Updated Code

#### Pull Latest Changes:

```bash
git pull origin main
# or download the updated release
```

#### Rebuild and Restart:

```bash
# For Docker deployments
docker-compose down
docker-compose build
docker-compose up -d

# For Node.js deployments
npm install
npm run build
npm run start
```

### Step 5: Verify Application Startup

Check that the application starts successfully:

```bash
# Check Docker logs
docker-compose logs -f dokploy

# Or check Node.js logs
pm2 logs dokploy
```

**Look for**:
- ✅ No errors about "ENCRYPTION_KEY environment variable is not set"
- ✅ Application starts normally
- ✅ Database connections successful

### Step 6: Encrypt Existing Data (Optional but Recommended)

If you have existing sensitive data in plaintext, run the migration script:

```bash
# Navigate to server package
cd packages/server

# Run migration script
npx tsx src/db/migrate-encrypt-secrets.ts
```

**Expected Output**:
```
🚀 Starting encryption migration...

🔐 Migrating certificates...
🔐 Migrating destinations...
🔐 Migrating registries...
...

📊 Migration Statistics:
========================

certificate:
  Total records: 5
  Newly encrypted: 5
  Already encrypted: 0
  Errors: 0

...

✅ Migration completed successfully!
```

### Step 7: Verify Functionality

Test that all features work correctly:

1. **Create a new database service** (MySQL/PostgreSQL/etc.)
   - Verify password is stored
   - Check database connection works

2. **Add a new SSL certificate**
   - Upload private key
   - Verify certificate installation

3. **Configure email notifications**
   - Add SMTP credentials
   - Send test notification

4. **Add SSH key**
   - Upload private key
   - Test SSH connection

### Step 8: Secure the Encryption Key

**CRITICAL**: Properly secure your encryption key:

1. **Backup the key separately** from database backups
   ```bash
   # Store in password manager or secure vault
   echo "ENCRYPTION_KEY=your_key_here" > encryption_key.txt.gpg
   gpg --encrypt --recipient your@email.com encryption_key.txt
   rm encryption_key.txt
   ```

2. **Use secrets management in production**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Secret Manager

3. **Never commit the key to version control**
   - Check `.env` is in `.gitignore`
   - Review git history for accidental commits

## Rollback Procedure

If you need to rollback:

### Immediate Rollback (Within Migration Window)

1. **Keep the encryption key** - You'll need it to read encrypted data

2. Restore code to previous version:
   ```bash
   git checkout <previous-version-tag>
   docker-compose up -d
   ```

3. If data was encrypted, it will remain encrypted but unreadable by old code

### Full Rollback with Data Recovery

1. Restore database from backup:
   ```bash
   psql -U dokploy -h localhost dokploy < dokploy_backup_YYYYMMDD.sql
   ```

2. Restore code to previous version

3. Restart application

**Note**: This will lose any data created/modified after the backup.

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable is not set"

**Solution**: Set the environment variable before starting the application.

```bash
export ENCRYPTION_KEY=your_64_character_hex_string
```

### Error: "ENCRYPTION_KEY must be a 32-byte (64 character) hex string"

**Solution**: Generate a valid key:

```bash
openssl rand -hex 32
```

The key must be exactly 64 hexadecimal characters.

### Error: "Decryption failed"

**Possible causes**:
1. Encryption key changed after data was encrypted
2. Corrupted encrypted data
3. Wrong encryption key

**Solution**:
- Restore the original encryption key
- Check application logs for details
- Verify the key hasn't been modified

### New Resources Fail to Create

**Check**:
1. ENCRYPTION_KEY is set
2. Application has restarted after setting the key
3. Check application logs for encryption errors

### Migration Script Errors

**If migration fails**:
1. Check ENCRYPTION_KEY is set
2. Verify database connectivity
3. Check logs for specific table errors
4. Re-run migration (it's idempotent - safe to run multiple times)

## Verification Checklist

After upgrade, verify:

- [ ] Application starts without errors
- [ ] ENCRYPTION_KEY is set in environment
- [ ] New resources can be created (databases, certificates, etc.)
- [ ] Existing resources still accessible
- [ ] Migration script completed successfully (if run)
- [ ] Encryption key is backed up securely
- [ ] Environment files don't contain the key in version control

## Post-Upgrade Best Practices

1. **Monitor Logs**: Watch for encryption-related errors in the first 24 hours

2. **Test All Features**: Verify all sensitive operations work:
   - Database creation/connection
   - SSL certificate management
   - Email notifications
   - Docker registry authentication
   - SSH key usage

3. **Review Security**:
   - Verify encryption key is secure
   - Check database access controls
   - Review audit logs
   - Ensure backups are encrypted

4. **Document Key Location**: Ensure team knows where encryption key is stored

5. **Plan Key Rotation**: Schedule regular key rotation (annually recommended)

## Getting Help

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review application logs
3. Check `packages/server/src/utils/ENCRYPTION_SETUP.md` for detailed setup
4. Review `SECURITY_ENCRYPTION_PATCH.md` for technical details
5. Open an issue with:
   - Error messages
   - Application logs
   - Steps to reproduce
   - Environment details

## Security Considerations

### What's Protected Now

✅ Certificate private keys (encrypted at rest)
✅ Cloud storage credentials (encrypted at rest)  
✅ Docker registry passwords (encrypted at rest)
✅ SMTP passwords (encrypted at rest)
✅ SSH private keys (encrypted at rest)
✅ Database passwords (encrypted at rest)
✅ HTTP Basic Auth passwords (bcrypt hashed)

### What's NOT Changed

- Session tokens (already securely hashed by better-auth)
- API keys (already securely hashed by better-auth)
- User account passwords (already bcrypt hashed)

### Additional Recommendations

1. **Enable Database Encryption at Rest**: Use PostgreSQL's built-in encryption
2. **Use TLS/SSL**: Enable SSL for database connections
3. **Enable RLS**: Consider PostgreSQL Row-Level Security
4. **Network Isolation**: Keep database in private network
5. **Regular Audits**: Review access logs regularly

## Compliance Notes

This encryption implementation helps meet:
- PCI DSS requirements for credential storage
- GDPR requirements for personal data protection
- HIPAA requirements for PHI encryption
- SOC 2 security control requirements

Consult your compliance team to ensure all requirements are met.
