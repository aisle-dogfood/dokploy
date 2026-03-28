# Encryption Setup Guide

This document describes how to set up and configure encryption for sensitive data in Dokploy.

## Overview

Dokploy now encrypts sensitive data at rest using industry-standard encryption:

- **AES-256-GCM** encryption for secrets (API keys, private keys, tokens, webhook URLs)
- **bcrypt** hashing for passwords with cost factor 12

This protects sensitive data from:
- Database compromises
- Backup leaks
- Unauthorized API access
- Logs and error messages

## Quick Start

### 1. Generate an Encryption Key

Generate a secure 32-byte encryption key:

```bash
openssl rand -hex 32
```

This will output a 64-character hexadecimal string like:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### 2. Set the Environment Variable

Add the `ENCRYPTION_KEY` to your environment:

**For Development:**
```bash
export ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

Add it to your `.env` file:
```
ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

**For Production (Docker):**
```bash
docker run -e ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2 ...
```

Or add to your `docker-compose.yml`:
```yaml
environment:
  - ENCRYPTION_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### 3. Migrate Existing Data

If you have existing data in plaintext, run the migration script:

```bash
cd packages/server
pnpm tsx scripts/migrate-encrypt-secrets.ts
```

This will:
- Encrypt all existing S3 secret access keys
- Hash all existing passwords
- Encrypt all existing private keys and tokens
- Skip already encrypted/hashed data (safe to run multiple times)

## What Gets Encrypted/Hashed

### Encrypted (AES-256-GCM)
- S3/Backblaze secret access keys
- SSL certificate private keys
- SSH private keys
- Telegram bot tokens
- Slack webhook URLs
- Discord webhook URLs
- Gotify app tokens

### Hashed (bcrypt)
- Container registry passwords
- Basic authentication passwords
- Redis database passwords
- SMTP/email passwords

## Security Best Practices

### Key Management

1. **Store the key securely**
   - Use a password manager
   - Use a secrets management service (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Never commit to version control
   - Never share via email or chat

2. **Key rotation**
   - Rotate the encryption key periodically (e.g., annually)
   - When rotating, decrypt with old key and re-encrypt with new key

3. **Backup the key**
   - Store in a secure, separate location from database backups
   - Document the recovery procedure
   - Test recovery procedure periodically

### Deployment

1. **Environment separation**
   - Use different keys for development, staging, and production
   - Never use production keys in non-production environments

2. **Access control**
   - Limit who can access the encryption key
   - Use role-based access control (RBAC)
   - Audit key access regularly

3. **Monitoring**
   - Monitor for failed decryption attempts
   - Alert on encryption/decryption errors
   - Log key rotation events

## Troubleshooting

### "ENCRYPTION_KEY environment variable is not set"

**Solution:** Set the `ENCRYPTION_KEY` environment variable as described above.

### "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"

**Solution:** The key must be exactly 64 hexadecimal characters. Generate a new one:
```bash
openssl rand -hex 32
```

### "Failed to decrypt secret"

**Possible causes:**
1. Wrong encryption key - ensure you're using the same key that was used to encrypt
2. Corrupted data - restore from backup
3. Key rotation without re-encryption - run migration with new key

### Database passwords don't work after migration

**Issue:** Passwords are now hashed, so they can't be retrieved in plaintext.

**For basic auth passwords:** Users need to reset/update their passwords through the UI.

**For service passwords (Redis, databases):** The migration maintains backward compatibility. If you need to update a password, the service will hash it automatically on the next update.

## API Changes

### Response Sanitization

Sensitive fields are now redacted in API responses:

```json
{
  "secretAccessKey": "[REDACTED]",
  "password": "[REDACTED]",
  "privateKey": "[REDACTED]"
}
```

This prevents accidental exposure of secrets in:
- API responses
- Logs
- Error messages
- Client-side code

### Password Verification

For hashed passwords (basic auth), use the verification endpoint instead of comparing values directly.

## Migration Rollback

If you need to rollback the encryption changes:

1. **Restore from backup** taken before running the migration
2. **Remove** the `ENCRYPTION_KEY` environment variable
3. **Redeploy** the previous version of the application

⚠️ **Warning:** Once data is encrypted, you cannot decrypt it without the encryption key. Always back up your key securely!

## Support

If you encounter issues with encryption setup:

1. Check the logs for detailed error messages
2. Verify the `ENCRYPTION_KEY` is set correctly
3. Ensure you're using the correct key for the environment
4. Review this guide for common issues
5. Contact support if issues persist

## Technical Details

### Encryption Algorithm
- **Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key size:** 256 bits (32 bytes)
- **IV size:** 128 bits (16 bytes, randomly generated per encryption)
- **Authentication:** Built-in authentication tag for integrity verification

### Encrypted Data Format
```
iv:authTag:ciphertext
```
All components are hex-encoded.

### Password Hashing
- **Algorithm:** bcrypt
- **Cost factor:** 12 (2^12 = 4096 iterations)
- **Salt:** Automatically generated per password

### Key Derivation
The encryption key is used directly (no key derivation function). Ensure you generate a cryptographically secure random key.
