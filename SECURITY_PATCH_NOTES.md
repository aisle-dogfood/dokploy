# Security Patch: Encryption of Sensitive Data at Rest

## Summary

This patch addresses a critical security vulnerability where sensitive secrets and private keys were stored in plaintext in the database. All sensitive fields are now encrypted at rest using AES-256-GCM encryption.

## Vulnerability Details

**Severity**: Critical  
**Issue**: Plaintext storage of sensitive secrets and private keys  
**Impact**: If the database, backups, or exports were compromised, attackers could obtain:
- TLS/SSH private keys
- Database passwords
- API tokens and keys
- Session tokens
- OAuth access/refresh tokens
- Third-party service credentials

## Changes Made

### 1. Encryption Infrastructure

Created new encryption utilities:
- `packages/server/src/utils/encryption.ts` - Core encryption/decryption functions using AES-256-GCM
- `packages/server/src/db/schema/encrypted.ts` - Custom Drizzle column type for automatic encryption

### 2. Schema Updates

Updated the following schema files to use encrypted fields:

#### Authentication & Authorization
- `account.ts`: Encrypted `access_token`, `refresh_token`, `id_token`, API key storage (`apikey.key`), and 2FA secrets (`secret`, `backup_codes`)
- `session.ts`: Encrypted session `token`
- `user.ts`: Encrypted `sshPrivateKey`

#### Certificates & Keys
- `certificate.ts`: Encrypted `privateKey` and `certificateData`
- `ssh-key.ts`: Encrypted `privateKey`

#### Infrastructure & Services
- `destination.ts`: Encrypted S3/storage `accessKey` and `secretAccessKey`
- `ai.ts`: Encrypted AI service `apiKey`

#### Database Services
- `postgres.ts`: Encrypted `databasePassword`
- `mysql.ts`: Encrypted `databasePassword` and `rootPassword`
- `mariadb.ts`: Encrypted `databasePassword` and `rootPassword`
- `mongo.ts`: Encrypted `databasePassword`
- `redis.ts`: Encrypted database password

#### Applications & Registries
- `registry.ts`: Encrypted registry `password`
- `application.ts`: Encrypted Docker registry `password`
- `security.ts`: Encrypted basic auth `password`

#### Notification Services
- `notification.ts`: Encrypted:
  - Email SMTP `password`
  - Telegram `botToken`
  - Gotify `appToken`

#### Git Providers
- `github.ts`: Encrypted `githubClientSecret`, `githubPrivateKey`, `githubWebhookSecret`
- `gitlab.ts`: Encrypted `secret`, `accessToken`, `refreshToken`
- `gitea.ts`: Encrypted `clientSecret`, `accessToken`, `refreshToken`
- `bitbucket.ts`: Encrypted `appPassword`

### 3. Documentation

- `packages/server/ENCRYPTION_SETUP.md`: Comprehensive setup and migration guide

## Migration Requirements

### For New Installations
No action required. Encryption is automatic.

### For Existing Installations

**CRITICAL**: You must set the `ENCRYPTION_KEY` environment variable:

```bash
# Generate a secure key
export ENCRYPTION_KEY="$(openssl rand -base64 32)"

# Or set it permanently in your environment configuration
```

#### Migration Steps

1. **Back up your database**:
   ```bash
   pg_dump dokploy > backup_before_encryption.sql
   ```

2. **Set the encryption key** in your environment

3. **Restart the application** - existing plaintext values will be encrypted on first read/write

4. **Verify** that sensitive data is now encrypted in the database

## Security Best Practices

### Key Management
- ✅ Store `ENCRYPTION_KEY` in a secrets management system
- ✅ Never commit encryption keys to version control
- ✅ Rotate keys periodically (requires data re-encryption)
- ✅ Back up encryption keys securely

### Operations
- ✅ Encrypt database backups
- ✅ Use TLS for database connections
- ✅ Implement access controls
- ✅ Enable audit logging
- ✅ Regular security assessments

## Technical Details

**Encryption Algorithm**: AES-256-GCM  
**Key Derivation**: scrypt with unique salt  
**Authentication**: GCM mode provides authenticated encryption  
**Format**: `base64(salt + iv + auth_tag + ciphertext)`

**Features**:
- Transparent encryption/decryption via custom Drizzle column type
- Authenticated encryption prevents tampering
- Unique IV per encryption operation
- Constant-time comparison for security

## Testing

The encryption implementation includes:
- Automatic encryption on write operations
- Automatic decryption on read operations
- Error handling for corrupted data
- Validation of encrypted data format

## Compliance

This patch helps achieve compliance with:
- PCI DSS (Payment Card Industry)
- GDPR (data protection requirements)
- HIPAA (healthcare data)
- SOC 2 (security controls)

## Rollback Procedure

If issues arise:

1. Restore from backup taken before encryption
2. Revert to previous version
3. Investigate and resolve issues
4. Re-apply patch with corrections

## Support

For issues or questions:
1. Check `packages/server/ENCRYPTION_SETUP.md` for detailed setup instructions
2. Verify `ENCRYPTION_KEY` is set correctly
3. Review application logs for encryption errors

## Version Information

- **Patch Date**: 2024
- **Affected Versions**: All versions prior to this patch
- **Fixed Version**: Current

## Acknowledgments

This security fix addresses a critical vulnerability in the handling of sensitive data at rest. All users are strongly encouraged to apply this patch immediately.
