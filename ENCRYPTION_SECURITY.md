# Encryption Security Documentation

## Overview

This document describes the encryption implementation for sensitive data in Dokploy, specifically for notification service tokens and credentials.

## What is Encrypted

The following sensitive data is encrypted at rest in the database:

- **Gotify appToken**: Application tokens for Gotify notification service
- Other sensitive tokens are masked in API responses

## Encryption Method

### Algorithm
- **AES-256-GCM** (Advanced Encryption Standard with Galois/Counter Mode)
- 256-bit key size for strong encryption
- Authenticated encryption providing both confidentiality and integrity
- Industry-standard encryption approved by NIST

### Key Derivation
- Encryption key is derived from the `ENCRYPTION_KEY` environment variable
- Uses `scrypt` key derivation function with a salt for secure key generation
- 32-byte (256-bit) derived key

### Encrypted Data Format
Encrypted data is stored in the format: `iv:authTag:encrypted`
- `iv`: Initialization Vector (16 bytes) - ensures same plaintext encrypts to different ciphertext
- `authTag`: Authentication Tag (16 bytes) - ensures data integrity and authenticity
- `encrypted`: The actual encrypted data

## Setup Instructions

### 1. Generate Encryption Key

Generate a secure random encryption key using OpenSSL:

```bash
openssl rand -base64 32
```

### 2. Set Environment Variable

Add the generated key to your environment configuration:

**For Development (.env):**
```bash
ENCRYPTION_KEY="your-generated-key-here"
```

**For Production (.env.production):**
```bash
ENCRYPTION_KEY="your-generated-key-here"
```

**For Docker deployments:**
```bash
docker run -e ENCRYPTION_KEY="your-generated-key-here" ...
```

### 3. Important Security Notes

⚠️ **CRITICAL WARNINGS:**

1. **Keep the encryption key secret**: Never commit the encryption key to version control
2. **Backup the key securely**: If you lose the encryption key, encrypted data cannot be recovered
3. **Use different keys per environment**: Development, staging, and production should have different keys
4. **Rotate keys periodically**: Implement key rotation as part of your security policy
5. **Never change the key without migration**: Changing the key will make existing encrypted data unreadable

## Migration

### Automatic Migration

When the application starts, it automatically:
1. Runs database schema migrations
2. Encrypts any existing plaintext tokens in the database
3. Skips already encrypted tokens (idempotent)

### Manual Migration

If needed, you can manually run the encryption migration:

```bash
# Using Node.js
node -r esbuild-register packages/server/src/utils/encrypt-existing-tokens.ts

# Or via the migration system
npm run migrate
```

The migration is safe to run multiple times as it:
- Detects already encrypted tokens and skips them
- Processes each record individually
- Continues even if individual records fail
- Logs all actions for audit purposes

## API Security

### Token Masking

When sensitive data is returned via API endpoints:
- Tokens are automatically masked showing only first 4 and last 4 characters
- Example: `abcd****wxyz` instead of full token
- Original tokens are only used internally for sending notifications

### Affected Endpoints

The following endpoints return masked tokens:
- `GET /api/notifications/all` - List all notifications
- `GET /api/notifications/one` - Get single notification by ID

### Example Response

```json
{
  "notificationId": "xxx",
  "gotify": {
    "serverUrl": "https://gotify.example.com",
    "appToken": "Axyz****9876",  // Masked token
    "priority": 5
  }
}
```

## Encryption/Decryption Flow

### When Creating/Updating Notifications

1. User submits notification with plaintext token
2. Application encrypts token using AES-256-GCM
3. Encrypted token stored in database
4. Success response returned to user

### When Sending Notifications

1. Application retrieves encrypted token from database
2. Token is decrypted in memory
3. Decrypted token used to send notification
4. Decrypted token discarded after use (not logged)

### When Retrieving Notifications

1. Application retrieves encrypted token from database
2. Token is decrypted for masking
3. Masked version returned to API client
4. Full token never exposed in responses

## Security Best Practices

### Key Management

1. **Environment Variables**: Store encryption key only in environment variables
2. **Secret Management**: Use secret management systems (AWS Secrets Manager, HashiCorp Vault, etc.) in production
3. **Access Control**: Limit who can access the encryption key
4. **Audit Logging**: Monitor access to encrypted data

### Operational Security

1. **HTTPS Only**: Always use HTTPS in production to protect data in transit
2. **Database Encryption**: Enable database encryption at rest as an additional layer
3. **Backup Security**: Ensure database backups are encrypted and secured
4. **Log Sanitization**: Tokens are never logged in plaintext

### Key Rotation Strategy

For key rotation:
1. Generate new encryption key
2. Deploy migration script that:
   - Decrypts data with old key
   - Re-encrypts with new key
   - Updates all records
3. Update `ENCRYPTION_KEY` environment variable
4. Restart application

## Troubleshooting

### "Encryption key not set" Warning

**Symptom**: Application logs warning about missing ENCRYPTION_KEY

**Solution**: Set the `ENCRYPTION_KEY` environment variable

### "Failed to decrypt sensitive data" Error

**Possible Causes**:
1. Encryption key was changed without migrating data
2. Database corruption
3. Manual modification of encrypted data

**Solution**: Restore from backup or re-create the affected notifications

### Data Not Encrypted After Migration

**Symptom**: Tokens still appear in plaintext in database

**Solution**: Check migration logs, ensure migration ran successfully, manually run encryption migration

## Compliance

This encryption implementation helps meet compliance requirements for:
- **GDPR**: Protection of personal data
- **PCI DSS**: Protection of sensitive authentication data
- **SOC 2**: Data encryption at rest
- **HIPAA**: Protection of sensitive information

## Technical Reference

### Encryption Module Location
`packages/server/src/utils/encryption.ts`

### Key Functions

- `encrypt(plaintext: string): string` - Encrypts data
- `decrypt(ciphertext: string): string` - Decrypts data  
- `maskToken(token: string): string` - Masks token for display

### Database Schema
Table: `gotify`
- Column: `appToken` (TEXT) - Stores encrypted token in format `iv:authTag:encrypted`

## Support

For security concerns or questions:
1. Review this documentation
2. Check application logs for specific error messages
3. Consult your security team
4. Report security vulnerabilities through responsible disclosure

---

**Last Updated**: 2024
**Version**: 1.0
