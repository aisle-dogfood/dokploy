# Security Patch: Application-Layer Encryption for Sensitive Secrets

## Overview

This patch implements application-layer encryption for sensitive credentials and secrets stored in the database. It addresses the vulnerability of plaintext storage of sensitive fields by encrypting them before storage and decrypting them when needed.

## Encryption Implementation

### Core Encryption Module

**File**: `packages/server/src/utils/encryption.ts`

- **Algorithm**: AES-256-GCM (Authenticated Encryption with Associated Data)
- **Key Derivation**: PBKDF2-HMAC-SHA512 with 100,000 iterations
- **Features**:
  - Random IV (16 bytes) for each encryption
  - Random salt (64 bytes) for key derivation
  - Authentication tag (16 bytes) for integrity verification
  - Backward compatibility with existing plaintext data
  - Graceful degradation with warning messages for legacy data

### Functions Provided

```typescript
encrypt(plaintext: string): string
decrypt(encryptedData: string): string
isEncrypted(value: string): boolean
reencrypt(encryptedData: string): string
```

## Fields Encrypted

### 1. Notification System

#### Email Notifications
- **Field**: `email.password`
- **Files Modified**:
  - `packages/server/src/services/notification.ts` (create/update)
  - `packages/server/src/utils/notifications/utils.ts` (usage/decryption)

#### Telegram Notifications
- **Field**: `telegram.botToken`
- **Files Modified**:
  - `packages/server/src/services/notification.ts` (create/update)
  - `packages/server/src/utils/notifications/utils.ts` (usage/decryption)

#### Gotify Notifications
- **Field**: `gotify.appToken`
- **Files Modified**:
  - `packages/server/src/services/notification.ts` (create/update)
  - `packages/server/src/utils/notifications/utils.ts` (usage/decryption)

### 2. Registry System

#### Container Registry Credentials
- **Field**: `registry.password`
- **Files Modified**:
  - `packages/server/src/services/registry.ts` (create/update/decryption)
  - `packages/server/src/utils/builders/index.ts` (usage/decryption)
  - `packages/server/src/utils/cluster/upload.ts` (usage/decryption)

### 3. Certificate System

#### SSL/TLS Private Keys
- **Field**: `certificate.privateKey`
- **Files Modified**:
  - `packages/server/src/services/certificate.ts` (create/decryption for file writing)

### 4. Backup Destination System

#### S3/Object Storage Credentials
- **Field**: `destination.secretAccessKey`
- **Files Modified**:
  - `packages/server/src/services/destination.ts` (create/update)
  - `packages/server/src/utils/backups/utils.ts` (usage/decryption)

### 5. Database Services

#### PostgreSQL
- **Field**: `postgres.databasePassword`
- **Files Modified**:
  - `packages/server/src/services/postgres.ts` (create/update)
  - `packages/server/src/utils/databases/postgres.ts` (usage/decryption)

## Additional Fields That Should Be Encrypted

The following fields also contain sensitive data and should receive similar encryption treatment:

### Database Passwords (Remaining)
1. **MySQL**
   - `mysql.databasePassword`
   - `mysql.databaseRootPassword`
   - Files: `packages/server/src/services/mysql.ts`, `packages/server/src/utils/databases/mysql.ts`

2. **MariaDB**
   - `mariadb.databasePassword`
   - `mariadb.databaseRootPassword`
   - Files: `packages/server/src/services/mariadb.ts`, `packages/server/src/utils/databases/mariadb.ts`

3. **MongoDB**
   - `mongo.databasePassword`
   - Files: `packages/server/src/services/mongo.ts`, `packages/server/src/utils/databases/mongo.ts`

4. **Redis**
   - `redis.databasePassword`
   - Files: `packages/server/src/services/redis.ts`, `packages/server/src/utils/databases/redis.ts`

### Application Credentials
- `application.password` (for Docker registry authentication)
  - Files: `packages/server/src/services/application.ts`, usage in builders

### Git Provider Tokens
- `github.githubPrivateKey`
- `gitlab.gitlabAccessToken`
- `gitea.giteaAccessToken`
- `bitbucket.appPassword`
  - Files: Various in `packages/server/src/services/` and `packages/server/src/utils/providers/`

### SSH Keys
- `sshKey.privateKey`
  - Files: `packages/server/src/services/ssh-key.ts` and various utilities

### Notification Webhooks (Optional)
- `slack.webhookUrl` (contains secret token)
- `discord.webhookUrl` (contains secret token)
  - Files: `packages/server/src/services/notification.ts`

## Environment Configuration

### Required Environment Variable

```bash
# Generate a secure random key
export ENCRYPTION_KEY=$(openssl rand -base64 32)
```

### Fallback Variables (in order of preference)
1. `ENCRYPTION_KEY` (recommended)
2. `SECRET_KEY`
3. `SECRET`

## Security Features

### 1. Encryption at Rest
- All sensitive data is encrypted before being written to the database
- Each encryption uses a unique IV and salt
- Authenticated encryption prevents tampering

### 2. Decryption on Use
- Secrets are decrypted only when needed
- Decrypted values are not persisted
- Minimal exposure in memory

### 3. Backward Compatibility
- Existing plaintext data is detected and handled gracefully
- Warning messages logged for legacy data
- Gradual migration path provided

### 4. Key Management
- Environment-based key storage
- Support for key rotation via `reencrypt()` function
- Clear documentation for production deployment

## Migration Strategy

### For New Installations
1. Set `ENCRYPTION_KEY` environment variable
2. All new data will be automatically encrypted

### For Existing Installations
1. Set `ENCRYPTION_KEY` environment variable
2. Existing plaintext data will continue to work (backward compatible)
3. When users update their credentials, they will be automatically encrypted
4. Optional: Run a migration script to re-encrypt all existing data

### Migration Script (To Be Implemented)
```typescript
// Pseudo-code for future migration
async function migrateExistingSecrets() {
  // For each table with sensitive fields
  // 1. Read the plaintext value
  // 2. Encrypt it
  // 3. Update the database
  // 4. Log progress
}
```

## Testing Recommendations

### Unit Tests
```typescript
describe('Encryption', () => {
  test('should encrypt and decrypt correctly', () => {
    const original = 'my-secret-password';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
    expect(encrypted).not.toBe(original);
  });

  test('should handle backward compatibility', () => {
    const plaintext = 'legacy-password';
    // Should not throw error when decrypting plaintext
    const result = decrypt(plaintext);
    expect(result).toBe(plaintext);
  });
});
```

### Integration Tests
- Test notification sending with encrypted credentials
- Test registry authentication with encrypted passwords
- Test database deployment with encrypted passwords
- Test backup operations with encrypted S3 credentials

## Monitoring and Logging

### Warning Messages
The system logs warnings when:
- Attempting to decrypt plaintext data (legacy)
- Encryption key is missing
- Decryption failures occur

### Audit Recommendations
1. Monitor failed authentication attempts (may indicate decryption issues)
2. Track when legacy plaintext data is accessed
3. Alert on repeated decryption failures
4. Log all encryption key access attempts

## Production Deployment Checklist

- [ ] Generate secure `ENCRYPTION_KEY`
- [ ] Store encryption key in secure key management system (KMS)
- [ ] Configure environment variable in deployment system
- [ ] Test encryption/decryption functionality
- [ ] Verify backward compatibility with existing data
- [ ] Document key rotation procedures
- [ ] Set up monitoring for decryption failures
- [ ] Train operations team on key management
- [ ] Create backup of encryption key (stored separately from database backups)
- [ ] Implement key rotation schedule (recommended: annually)

## Compliance Impact

This implementation helps meet compliance requirements for:
- **GDPR**: Data protection and encryption at rest
- **HIPAA**: Encryption of PHI (if applicable)
- **PCI DSS**: Protection of sensitive authentication data
- **SOC 2**: Security controls for data protection

## Known Limitations

1. **Encryption in Transit**: This patch only addresses encryption at rest. Ensure TLS/SSL is enabled for database connections.

2. **Key Storage**: The encryption key is stored in environment variables. For enhanced security, integrate with a proper KMS (AWS KMS, Azure Key Vault, HashiCorp Vault).

3. **Query Limitations**: Encrypted fields cannot be efficiently searched or indexed. If search functionality is needed, consider using searchable encryption or maintaining separate search indexes.

4. **Performance**: Encryption/decryption adds computational overhead. For high-throughput scenarios, consider caching decrypted values (with appropriate security controls).

5. **Partial Migration**: Not all database password fields have been updated in this initial patch. Follow-up work should encrypt MySQL, MariaDB, MongoDB, and Redis passwords.

## Files Modified

### New Files
- `packages/server/src/utils/encryption.ts` - Core encryption module
- `packages/server/ENCRYPTION_SETUP.md` - Setup documentation
- `SECURITY_PATCH_SUMMARY.md` - This file

### Modified Files
1. `packages/server/src/services/notification.ts`
2. `packages/server/src/services/registry.ts`
3. `packages/server/src/services/certificate.ts`
4. `packages/server/src/services/destination.ts`
5. `packages/server/src/services/postgres.ts`
6. `packages/server/src/utils/notifications/utils.ts`
7. `packages/server/src/utils/builders/index.ts`
8. `packages/server/src/utils/cluster/upload.ts`
9. `packages/server/src/utils/backups/utils.ts`
10. `packages/server/src/utils/databases/postgres.ts`

## Future Enhancements

1. **Complete Database Password Encryption**: Extend encryption to MySQL, MariaDB, MongoDB, and Redis
2. **SSH Key Encryption**: Encrypt private SSH keys
3. **Git Provider Token Encryption**: Encrypt OAuth tokens and access tokens
4. **Webhook URL Encryption**: Encrypt Discord and Slack webhook URLs
5. **KMS Integration**: Integrate with cloud provider KMS for better key management
6. **Audit Logging**: Comprehensive audit trail for sensitive data access
7. **Field-Level Permissions**: RBAC for sensitive field access
8. **Searchable Encryption**: For fields that need to be searchable
9. **Key Rotation**: Automated key rotation mechanism
10. **Migration Tool**: CLI tool for encrypting existing plaintext data

## Support and Maintenance

### Troubleshooting
See `packages/server/ENCRYPTION_SETUP.md` for common issues and solutions.

### Key Rotation
When rotating encryption keys:
1. Keep the old key accessible
2. Set new key as `ENCRYPTION_KEY`
3. Use `reencrypt()` to migrate data
4. Verify all data migrated successfully
5. Remove old key

### Disaster Recovery
- Store encryption keys separately from database backups
- Document key recovery procedures
- Test key recovery regularly
- Maintain encrypted backup of the encryption key itself

## Contributors
- Security audit team
- Development team
- Operations team

## References
- OWASP Cryptographic Storage Cheat Sheet
- NIST SP 800-175B: Guideline for Using Cryptographic Standards
- GDPR Article 32: Security of Processing
