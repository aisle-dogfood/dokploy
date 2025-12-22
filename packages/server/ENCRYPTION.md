# Database Encryption

## Overview

This document describes the encryption implementation for sensitive data in the Dokploy database.

## What is Encrypted?

All sensitive fields in the database are now automatically encrypted at rest using AES-256-GCM encryption. The following types of data are encrypted:

### Authentication & Authorization
- OAuth tokens (access tokens, refresh tokens, ID tokens)
- API keys
- 2FA secrets and backup codes
- Password reset tokens
- Session-related tokens (where applicable)

### Service Credentials
- Database passwords (PostgreSQL, MySQL, MariaDB, MongoDB, Redis)
- Registry passwords (Docker registries)
- Email SMTP passwords
- Security/Basic auth passwords

### Private Keys & Secrets
- SSH private keys
- Certificate private keys
- GitHub App private keys and secrets
- GitLab secrets and tokens
- Gitea client secrets and tokens
- Bitbucket app passwords
- Webhook secrets

### Third-Party Service Credentials
- S3/Object storage access keys and secret keys
- Notification service tokens (Slack, Discord, Telegram, Gotify)

## How Encryption Works

### Encryption Method
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **IV**: 16-byte random initialization vector (generated per encryption)
- **Auth Tag**: 16-byte authentication tag for integrity verification
- **Format**: `iv:authTag:encryptedData` (all hex-encoded)

### Encryption Key
The encryption key is derived from the `ENCRYPTION_KEY` environment variable. If not set, the system falls back to deriving a key from the `DATABASE_URL` for backward compatibility (not recommended for production).

**Important**: Always set a strong `ENCRYPTION_KEY` in production:

```bash
# Generate a secure 32-byte key:
openssl rand -hex 32

# Set in your environment:
export ENCRYPTION_KEY="your-generated-key-here"
```

### Automatic Encryption/Decryption
- Data is automatically encrypted when written to the database
- Data is automatically decrypted when read from the database
- The application code doesn't need to handle encryption/decryption explicitly

### Backward Compatibility
The decryption function includes backward compatibility for existing plaintext data:
- If data is not in the encrypted format (no `:` separators), it's returned as-is
- If decryption fails, the original value is returned (logged as a warning)
- This allows gradual migration of existing data

## Security Considerations

### Key Management
1. **Never commit** the `ENCRYPTION_KEY` to version control
2. Use environment variables or a secure secret management system
3. Rotate keys periodically (requires re-encryption of data)
4. Different environments (dev, staging, prod) should use different keys

### Data in Transit
- Encryption at rest complements TLS/SSL for data in transit
- Always use HTTPS for API communications
- Use SSL/TLS for database connections

### Access Control
- Database access should be restricted to authorized users only
- Use Row-Level Security (RLS) policies where applicable
- Regular security audits of database access logs

## Migration

For existing installations with plaintext data:

1. **Set the encryption key**: Add `ENCRYPTION_KEY` to your environment variables
2. **Restart the application**: The system will automatically encrypt new data
3. **Existing data**: Will be handled with backward compatibility until re-saved
4. **Force re-encryption**: Update records to trigger re-encryption:
   ```sql
   -- Example: Re-encrypt registry passwords
   UPDATE registry SET password = password;
   ```

## Monitoring

Watch for these warning messages in logs:
- `"WARNING: ENCRYPTION_KEY not set"` - Set a proper encryption key
- `"Decryption failed, returning original value"` - May indicate corrupted data or key mismatch

## Troubleshooting

### "Cannot decrypt data" errors
- Verify `ENCRYPTION_KEY` is set correctly
- Check if the key has changed since data was encrypted
- Ensure the encrypted data format is valid

### Performance concerns
- AES-GCM is highly performant
- Encryption/decryption happens at the ORM layer
- Negligible performance impact for typical workloads

## Related Files

- `packages/server/src/utils/encryption.ts` - Encryption utilities
- `packages/server/src/db/schema/encrypted-fields.ts` - Custom Drizzle column type
- All schema files in `packages/server/src/db/schema/` - Use `encryptedText()` for sensitive fields
