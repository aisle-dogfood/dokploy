# Encryption at Rest for Sensitive Data

## Overview

This implementation adds AES-256-GCM encryption for all sensitive data stored in the database, including:

- TLS/SSL private keys and certificates
- SSH private keys
- Cloud storage credentials (S3 access keys, secret keys)
- Database passwords (MySQL, PostgreSQL, MariaDB, MongoDB, Redis)
- OAuth tokens (access tokens, refresh tokens, ID tokens)
- API keys and session tokens
- SMTP passwords
- Registry passwords
- HTTP basic auth credentials
- Notification service tokens (Telegram bot tokens, Gotify app tokens)

## Security Features

1. **AES-256-GCM Encryption**: Industry-standard authenticated encryption algorithm
2. **Unique Initialization Vectors (IV)**: Each encryption operation uses a random IV
3. **Authentication Tags**: Ensures data integrity and prevents tampering
4. **Transparent Encryption/Decryption**: Automatic encryption on write, decryption on read
5. **Backward Compatibility**: Gracefully handles legacy unencrypted data during migration

## Setup

### 1. Generate Encryption Key

Generate a secure 256-bit encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Configure Environment Variable

Add the generated key to your `.env` file:

```bash
ENCRYPTION_KEY=your_64_character_hex_key_here
```

**IMPORTANT**: 
- Never commit the encryption key to version control
- Store the key securely (e.g., in a secrets manager like HashiCorp Vault, AWS Secrets Manager, or similar)
- Back up the key securely - losing it means losing access to all encrypted data
- Rotate the key periodically following your security policies

### 3. Encrypt Existing Data (Migration)

If you're upgrading an existing installation with plaintext secrets:

```bash
npm run encrypt-existing-data
```

This migration script:
- Identifies and encrypts all existing plaintext secrets
- Skips already-encrypted data (idempotent)
- Provides detailed progress and error reporting

**Before running in production**:
1. Create a complete database backup
2. Test in a staging environment first
3. Schedule during a maintenance window

## Architecture

### Encryption Utility (`packages/server/src/utils/encryption.ts`)

Core encryption/decryption functions:
- `encrypt(plaintext)`: Encrypts a string using AES-256-GCM
- `decrypt(ciphertext)`: Decrypts an encrypted string
- `generateEncryptionKey()`: Generates a new random encryption key
- `isEncrypted(data)`: Checks if data is already encrypted

Encrypted data format: `iv:authTag:encryptedData` (all hex-encoded)

### Custom Column Type (`packages/server/src/db/schema/encrypted-column.ts`)

Drizzle ORM custom column type that:
- Automatically encrypts values before database writes
- Automatically decrypts values on database reads
- Maintains backward compatibility with plaintext data

### Protected Tables

The following database tables now have encrypted columns:

1. **certificate**: `privateKey`, `certificateData`
2. **ssh-key**: `privateKey`
3. **destination**: `accessKey`, `secretAccessKey`
4. **account**: `accessToken`, `refreshToken`, `idToken`
5. **session_temp**: `token`
6. **security**: `password`
7. **redis**: `databasePassword`
8. **mysql**: `databasePassword`, `databaseRootPassword`
9. **postgres**: `databasePassword`
10. **mariadb**: `databasePassword`, `databaseRootPassword`
11. **mongo**: `databasePassword`
12. **registry**: `password`
13. **ai**: `apiKey`
14. **email**: `password`
15. **telegram**: `botToken`
16. **gotify**: `appToken`
17. **apikey**: `key`

## Key Management Best Practices

### Production Deployment

1. **Use a Key Management Service (KMS)**:
   - AWS KMS
   - Google Cloud KMS
   - Azure Key Vault
   - HashiCorp Vault

2. **Key Rotation**:
   - Implement periodic key rotation
   - Keep old keys accessible for decrypting existing data
   - Re-encrypt data with new keys during rotation

3. **Access Control**:
   - Limit access to the encryption key
   - Use environment-specific keys (dev, staging, production)
   - Audit key access

### Backup Strategy

1. **Database Backups**: Encrypted data is stored encrypted in backups
2. **Key Backups**: Store encryption keys separately from database backups
3. **Recovery Plan**: Document the key recovery process

## Migration Guide

### For New Installations

1. Generate and configure ENCRYPTION_KEY before first deployment
2. All secrets will be automatically encrypted from the start

### For Existing Installations

1. **Prepare**:
   ```bash
   # Backup database
   pg_dump dokploy > backup_$(date +%Y%m%d).sql
   
   # Generate encryption key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Deploy**:
   ```bash
   # Set ENCRYPTION_KEY in environment
   export ENCRYPTION_KEY=your_generated_key
   
   # Deploy updated code
   npm install
   npm run build
   ```

3. **Migrate Data**:
   ```bash
   # Run encryption migration
   npm run encrypt-existing-data
   ```

4. **Verify**:
   - Check logs for any errors
   - Verify application functionality
   - Confirm secrets are working correctly

## Troubleshooting

### "ENCRYPTION_KEY environment variable is not set" Warning

- **Issue**: Encryption key not configured
- **Solution**: Set ENCRYPTION_KEY in your environment variables
- **Note**: Development mode will use a default key (INSECURE for production)

### "Failed to decrypt data" Errors

- **Possible causes**:
  - Wrong encryption key
  - Corrupted data
  - Legacy unencrypted data
- **Solution**: 
  - Verify ENCRYPTION_KEY is correct
  - Check logs for specific error details
  - Run migration script if upgrading

### Performance Considerations

- Encryption/decryption adds minimal overhead (~1ms per operation)
- Consider caching decrypted values in memory for frequently accessed secrets
- Database queries are not affected (encryption is transparent)

## Security Audit Checklist

- [ ] ENCRYPTION_KEY is randomly generated and sufficiently long (64 hex chars)
- [ ] Encryption key is stored in a secure secrets manager
- [ ] Encryption key is not in version control
- [ ] Database backups are stored securely
- [ ] Key rotation policy is defined and documented
- [ ] Access to encryption keys is logged and audited
- [ ] Disaster recovery plan includes key recovery
- [ ] All sensitive fields identified in audit are encrypted
- [ ] Migration completed successfully without errors
- [ ] Application tested with encrypted data

## Compliance

This implementation helps meet requirements for:
- **PCI DSS**: Protection of cardholder data at rest
- **HIPAA**: Encryption of electronic protected health information (ePHI)
- **GDPR**: Security of personal data processing
- **SOC 2**: Encryption of sensitive data

## Additional Resources

- [NIST Guidelines on Cryptographic Key Management](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
