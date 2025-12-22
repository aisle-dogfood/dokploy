# Encryption Guide for Sensitive Data

## Overview

This application now encrypts sensitive data at rest using AES-256-GCM encryption. This includes passwords, tokens, API keys, and other secrets stored in the database.

## Encrypted Fields

The following fields are encrypted at rest:

### Registry
- `password` - Registry authentication password

### Notifications
- **Email**: `password` - SMTP password
- **Gotify**: `appToken` - Gotify app token
- **Telegram**: `botToken` - Telegram bot token
- **Slack**: `webhookUrl` - Slack webhook URL
- **Discord**: `webhookUrl` - Discord webhook URL

### Destinations
- `secretAccessKey` - AWS/S3 secret access key

### AI
- `apiKey` - AI provider API key

### Databases
- **PostgreSQL**: `databasePassword` - Database password
- **MySQL**: `databasePassword`, `databaseRootPassword` - Database passwords
- **MariaDB**: `databasePassword`, `databaseRootPassword` - Database passwords
- **MongoDB**: `databasePassword` - Database password
- **Redis**: `databasePassword` - Database password

### Git Providers
- **GitHub**: `githubClientSecret`, `githubPrivateKey`, `githubWebhookSecret`
- **GitLab**: `secret`, `accessToken`, `refreshToken`
- **Gitea**: `clientSecret`, `accessToken`, `refreshToken`
- **Bitbucket**: `appPassword`

## Setup

### 1. Set Encryption Key

Set the `ENCRYPTION_KEY` environment variable with a strong, random key:

```bash
# Generate a secure random key (Linux/macOS)
export ENCRYPTION_KEY=$(openssl rand -hex 32)

# Or manually set a strong key
export ENCRYPTION_KEY="your-very-strong-and-random-key-here"
```

**Important**: 
- The encryption key should be at least 32 characters long
- Store it securely (use a secret manager in production)
- **NEVER** commit the encryption key to version control
- If you lose the encryption key, encrypted data cannot be recovered

### 2. Backward Compatibility

The encryption system is designed to be backward compatible:

- If `ENCRYPTION_KEY` is not set, the system will still function but will **NOT encrypt** new data
- Existing plaintext data will be read without issues
- A warning will be logged when encryption key is missing

### 3. Migration Process

To encrypt existing plaintext data:

1. Set the `ENCRYPTION_KEY` environment variable
2. Restart the application
3. New data will be automatically encrypted
4. Existing data will be automatically encrypted when updated

For bulk encryption of existing data, you can create a migration script or update records through the application interface.

## Security Best Practices

1. **Key Management**
   - Use environment variables or secret managers (HashiCorp Vault, AWS Secrets Manager, etc.)
   - Rotate encryption keys periodically
   - Use different keys for development, staging, and production

2. **Access Control**
   - Ensure database backups are also encrypted
   - Limit access to the database
   - Monitor access logs for sensitive tables

3. **API Security**
   - Sensitive fields are excluded from API responses by default where appropriate
   - Never log decrypted secrets
   - Use HTTPS/TLS for all API communications

4. **Audit Trail**
   - Monitor access to encrypted fields
   - Log encryption/decryption operations (without logging the actual secrets)
   - Implement alerts for unusual access patterns

## Technical Details

### Encryption Algorithm

- **Algorithm**: AES-256-GCM
- **IV**: 16 bytes (randomly generated per encryption)
- **Key Derivation**: SHA-256 hash of the ENCRYPTION_KEY environment variable
- **Storage Format**: `base64(iv):base64(authTag):base64(encryptedData)`

### Implementation

The encryption is implemented using:
- Custom Drizzle column type (`encryptedText`)
- Node.js built-in `crypto` module
- Transparent encryption/decryption during database operations

### Error Handling

- Decryption errors are caught and logged
- Failed decryption returns the original ciphertext (for debugging)
- Empty/null values are handled gracefully

## Troubleshooting

### Data appears as gibberish after encryption
This is expected. Encrypted data is stored as base64-encoded strings with the format `iv:authTag:encryptedData`.

### Cannot decrypt data after key change
If you change the encryption key, previously encrypted data cannot be decrypted. Always backup data before key rotation.

### Performance concerns
Encryption/decryption is performed on each database read/write. For high-traffic applications, consider:
- Caching decrypted values (securely, in memory only)
- Using database connection pooling
- Monitoring query performance

## Future Enhancements

Potential improvements for the encryption system:

1. **Key Rotation**: Support for multiple encryption keys with versioning
2. **Field-level Masking**: Automatically mask sensitive fields in logs and error messages
3. **Audit Logging**: Detailed audit trail for all access to sensitive fields
4. **RLS (Row Level Security)**: Enable PostgreSQL RLS for additional security
5. **HSM Integration**: Support for Hardware Security Modules in production
