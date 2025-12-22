# Encryption Implementation Changelog

## Summary
Implemented comprehensive AES-256-GCM encryption for all sensitive data stored in the database to address the plaintext storage vulnerability.

## New Files Created

### Core Encryption Infrastructure
1. **packages/server/src/utils/encryption.ts**
   - Core encryption/decryption functions using AES-256-GCM
   - Key management utilities
   - Backward compatibility handling for legacy plaintext data
   - Functions: `encrypt()`, `decrypt()`, `generateEncryptionKey()`, `isEncrypted()`

2. **packages/server/src/db/schema/encrypted-column.ts**
   - Custom Drizzle ORM column type for transparent encryption
   - Automatically encrypts on write, decrypts on read
   - Zero code changes required in application logic

3. **packages/server/src/utils/encrypt-existing-data.ts**
   - Migration utility to encrypt existing plaintext data
   - Idempotent operation (safe to run multiple times)
   - Detailed progress reporting and error handling

4. **packages/server/src/utils/generate-encryption-key.ts**
   - CLI utility to generate secure 256-bit encryption keys
   - Provides usage instructions and security warnings

### Documentation
5. **packages/server/ENCRYPTION.md**
   - Comprehensive encryption documentation
   - Architecture details
   - Key management best practices
   - Migration guide
   - Troubleshooting section
   - Compliance information

6. **ENCRYPTION_QUICKSTART.md**
   - Quick reference guide for setup
   - Step-by-step instructions for new and existing installations
   - Common troubleshooting tips

7. **ENCRYPTION_CHANGELOG.md** (this file)
   - Complete list of changes made

## Modified Files

### Database Schema Files
All sensitive fields updated to use `encryptedText()` column type:

1. **packages/server/src/db/schema/certificate.ts**
   - `privateKey` - TLS private keys
   - `certificateData` - Certificate data

2. **packages/server/src/db/schema/ssh-key.ts**
   - `privateKey` - SSH private keys

3. **packages/server/src/db/schema/destination.ts**
   - `accessKey` - S3/Cloud access keys
   - `secretAccessKey` - S3/Cloud secret keys

4. **packages/server/src/db/schema/account.ts**
   - `accessToken` - OAuth access tokens
   - `refreshToken` - OAuth refresh tokens
   - `idToken` - OAuth ID tokens
   - `apikey.key` - API keys

5. **packages/server/src/db/schema/session.ts**
   - `token` - Session tokens

6. **packages/server/src/db/schema/security.ts**
   - `password` - HTTP basic auth passwords

7. **packages/server/src/db/schema/redis.ts**
   - `databasePassword` - Redis passwords

8. **packages/server/src/db/schema/mysql.ts**
   - `databasePassword` - MySQL user passwords
   - `databaseRootPassword` - MySQL root passwords

9. **packages/server/src/db/schema/postgres.ts**
   - `databasePassword` - PostgreSQL passwords

10. **packages/server/src/db/schema/mariadb.ts**
    - `databasePassword` - MariaDB user passwords
    - `databaseRootPassword` - MariaDB root passwords

11. **packages/server/src/db/schema/mongo.ts**
    - `databasePassword` - MongoDB passwords

12. **packages/server/src/db/schema/registry.ts**
    - `password` - Container registry passwords

13. **packages/server/src/db/schema/ai.ts**
    - `apiKey` - AI service API keys

14. **packages/server/src/db/schema/notification.ts**
    - `email.password` - SMTP passwords
    - `telegram.botToken` - Telegram bot tokens
    - `gotify.appToken` - Gotify app tokens
    - `slack.webhookUrl` - Slack webhook URLs (contain secrets)
    - `discord.webhookUrl` - Discord webhook URLs (contain secrets)

15. **packages/server/src/db/schema/github.ts**
    - `githubClientSecret` - GitHub OAuth client secrets
    - `githubPrivateKey` - GitHub App private keys
    - `githubWebhookSecret` - GitHub webhook secrets

16. **packages/server/src/db/schema/gitlab.ts**
    - `secret` - GitLab OAuth secrets
    - `accessToken` - GitLab access tokens
    - `refreshToken` - GitLab refresh tokens

17. **packages/server/src/db/schema/bitbucket.ts**
    - `appPassword` - Bitbucket app passwords

18. **packages/server/src/db/schema/gitea.ts**
    - `clientSecret` - Gitea OAuth client secrets
    - `accessToken` - Gitea access tokens
    - `refreshToken` - Gitea refresh tokens

19. **packages/server/src/db/schema/application.ts**
    - `password` - Docker registry passwords

### Configuration Files
20. **apps/dokploy/.env.example**
    - Added `ENCRYPTION_KEY` environment variable
    - Added documentation and generation instructions

21. **packages/server/src/index.ts**
    - Exported encryption utilities for external use

22. **SECURITY.md**
    - Added section on encryption features
    - Added security best practices
    - Added key management guidelines

## Security Improvements

### Encryption Details
- **Algorithm**: AES-256-GCM (Authenticated Encryption)
- **Key Size**: 256 bits (32 bytes)
- **IV Length**: 128 bits (16 bytes, randomly generated per encryption)
- **Authentication Tag**: 128 bits (16 bytes, validates integrity)
- **Data Format**: `iv:authTag:encryptedData` (hex-encoded)

### Protected Data Types
- ✅ TLS/SSL private keys and certificates
- ✅ SSH private keys
- ✅ Cloud storage credentials (S3, etc.)
- ✅ Database passwords (all types)
- ✅ OAuth tokens (GitHub, GitLab, Bitbucket, Gitea)
- ✅ API keys and session tokens
- ✅ SMTP/Email passwords
- ✅ Container registry passwords
- ✅ HTTP basic auth credentials
- ✅ Notification service tokens
- ✅ Git provider secrets and webhooks

### Key Features
- **Backward Compatibility**: Gracefully handles existing plaintext data
- **Transparent Operation**: No application code changes required
- **Migration Support**: Utility to encrypt existing data
- **Key Generation**: Secure key generation utility
- **Comprehensive Documentation**: Setup, migration, and troubleshooting guides

## Breaking Changes
**None** - The implementation is backward compatible. Existing plaintext data will be automatically encrypted on next write, or can be bulk-encrypted using the migration utility.

## Migration Path

### For New Installations
1. Set `ENCRYPTION_KEY` environment variable before first deployment
2. All data will be encrypted from the start

### For Existing Installations
1. Backup database
2. Set `ENCRYPTION_KEY` environment variable
3. Deploy updated code
4. Run `npm run encrypt-existing-data` migration
5. Verify functionality

## Known Limitations

1. **JSONB Fields**: The `server.metricsConfig.server.token` field is stored in a JSONB column and is not currently encrypted. This token is used for metrics collection and should be addressed in a future update with JSONB-aware encryption.

2. **Database Exports**: While data is encrypted in the database, ensure that database exports are also handled securely and encryption keys are stored separately.

3. **Memory**: Decrypted values exist in application memory during processing. Ensure proper memory management and avoid logging decrypted values.

## Compliance Impact
This implementation helps meet compliance requirements for:
- PCI DSS (encryption of cardholder data)
- HIPAA (encryption of ePHI)
- GDPR (security of personal data)
- SOC 2 (encryption controls)

## Testing Recommendations
1. Verify encryption/decryption of all sensitive fields
2. Test backward compatibility with existing plaintext data
3. Verify migration script on a copy of production data
4. Load testing to ensure acceptable performance
5. Test key rotation procedures

## Future Enhancements
- [ ] Key rotation utility
- [ ] JSONB field encryption support
- [ ] Hardware Security Module (HSM) integration
- [ ] Audit logging for encryption key access
- [ ] Automated key backup and recovery
- [ ] Encryption metrics and monitoring

## Support
For issues or questions:
- Email: contact@dokploy.com
- Documentation: packages/server/ENCRYPTION.md
- Quick Start: ENCRYPTION_QUICKSTART.md
