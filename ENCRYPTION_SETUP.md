# Database Encryption Setup

## Overview

This document describes the encryption implementation for sensitive data stored in the Dokploy database.

## Security Issue Addressed

Previously, sensitive secrets and tokens were stored in plaintext across multiple database tables, including:
- SSL/TLS certificates and private keys
- SSH private keys
- Database passwords (MySQL, MariaDB, PostgreSQL, MongoDB, Redis)
- Docker registry passwords
- Git provider credentials (GitHub, GitLab, Gitea, Bitbucket)
- Notification service tokens and webhooks (Slack, Discord, Telegram, Email SMTP, Gotify)
- API tokens and secrets

If the database, backups, or logs were compromised, attackers could retrieve these credentials.

## Solution

The fix implements **AES-256-GCM** (Galois/Counter Mode) encryption for all sensitive fields. This provides:
- **Confidentiality**: Data is encrypted at rest
- **Integrity**: Authentication tags prevent tampering
- **Key-based encryption**: Controlled by a single encryption key

## Encryption Implementation

### Encryption Utility (`packages/server/src/utils/encryption.ts`)

The encryption module provides:
- `encrypt(text: string): string` - Encrypts plaintext using AES-256-GCM
- `decrypt(text: string): string` - Decrypts ciphertext
- `encryptedText()` - Drizzle ORM custom type for required encrypted fields
- `encryptedTextOptional()` - Drizzle ORM custom type for optional encrypted fields

### Encrypted Format

Encrypted data is stored in the format: `iv:authTag:encryptedData`
- **IV** (Initialization Vector): 12 bytes, random, hex-encoded
- **AuthTag** (Authentication Tag): 16 bytes, hex-encoded
- **EncryptedData**: Ciphertext, hex-encoded

### Environment Variable Required

**ENCRYPTION_KEY** - A 64-character hexadecimal string (32 bytes for AES-256)

Generate with:
```bash
openssl rand -hex 32
```

**CRITICAL**: Store this key securely:
- Use a secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager)
- Never commit to version control
- Backup securely - losing this key means losing access to encrypted data
- Rotate periodically and re-encrypt data

### Example .env configuration

```bash
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_64_character_hex_string_here
```

## Protected Fields

### Certificates (`certificate` table)
- `certificateData` - SSL/TLS certificate
- `privateKey` - SSL/TLS private key

### SSH Keys (`ssh-key` table)
- `privateKey` - SSH private key

### Docker Registry (`registry` table)
- `password` - Registry authentication password

### GitHub Integration (`github` table)
- `githubClientSecret` - OAuth client secret
- `githubPrivateKey` - GitHub App private key
- `githubWebhookSecret` - Webhook secret

### GitLab Integration (`gitlab` table)
- `secret` - OAuth secret
- `accessToken` - GitLab access token
- `refreshToken` - GitLab refresh token

### Gitea Integration (`gitea` table)
- `clientSecret` - OAuth client secret
- `accessToken` - Gitea access token
- `refreshToken` - Gitea refresh token

### Bitbucket Integration (`bitbucket` table)
- `appPassword` - Bitbucket app password

### Application (`application` table)
- `password` - Docker registry password for private images

### Database Services
- **Redis** (`redis` table): `databasePassword`
- **MySQL** (`mysql` table): `databasePassword`, `databaseRootPassword`
- **MariaDB** (`mariadb` table): `databasePassword`, `databaseRootPassword`
- **PostgreSQL** (`postgres` table): `databasePassword`
- **MongoDB** (`mongo` table): `databasePassword`

### Notification Services
- **Slack** (`slack` table): `webhookUrl`
- **Discord** (`discord` table): `webhookUrl`
- **Telegram** (`telegram` table): `botToken`
- **Email** (`email` table): `password` (SMTP password)
- **Gotify** (`gotify` table): `appToken`

## Migration Strategy

### For New Installations
1. Generate an encryption key: `openssl rand -hex 32`
2. Set the `ENCRYPTION_KEY` environment variable
3. Start the application - all new data will be automatically encrypted

### For Existing Installations

**WARNING**: Migrating existing data requires careful planning and testing.

1. **Backup your database** before proceeding
2. Generate and securely store an encryption key
3. Set the `ENCRYPTION_KEY` environment variable
4. Run the data migration script (to be created) to encrypt existing plaintext data
5. Verify encrypted data is accessible
6. Update database schema with Drizzle migrations

## Data Migration Script

A migration script needs to be created to:
1. Read existing plaintext values
2. Encrypt them using the new encryption utility
3. Update the database records
4. Verify the migration

Example migration approach:
```typescript
import { db } from './db';
import { encrypt } from './utils/encryption';

async function migrateEncryption() {
  // Example for certificates
  const certificates = await db.query.certificates.findMany();
  for (const cert of certificates) {
    await db.update(certificates)
      .set({
        certificateData: encrypt(cert.certificateData),
        privateKey: encrypt(cert.privateKey)
      })
      .where(eq(certificates.certificateId, cert.certificateId));
  }
  // Repeat for all affected tables...
}
```

## Security Considerations

### Strengths
- **AES-256-GCM** is a NIST-approved authenticated encryption algorithm
- Automatic encryption/decryption at the ORM layer
- Single point of key management
- Prevents unauthorized access to plaintext secrets in database dumps

### Limitations
- **Key Management**: The encryption key itself must be protected
- **Application Layer**: Encryption happens at application layer, not database layer
- **Backup Security**: Encrypted backups still contain sensitive data if key is compromised
- **Key Rotation**: Changing the key requires re-encrypting all data

### Additional Recommendations
1. **Enable RLS** (Row Level Security) in PostgreSQL for defense in depth
2. **Encrypt database backups** at rest
3. **Implement key rotation** procedures
4. **Use a secrets manager** for the encryption key
5. **Monitor access** to encrypted fields
6. **Audit logging** for sensitive operations
7. **Network encryption** (TLS) for database connections
8. **Principle of least privilege** for database access

## Testing

Before deploying to production:
1. Test encryption/decryption in a development environment
2. Verify all API endpoints work correctly with encrypted data
3. Test backup and restore procedures
4. Verify performance impact is acceptable
5. Test key rotation procedures

## Troubleshooting

### "ENCRYPTION_KEY environment variable is not set"
- Ensure the environment variable is set before starting the application
- Check the variable is exported in your shell or .env file

### "ENCRYPTION_KEY must be a 64-character hex string"
- Generate a proper key: `openssl rand -hex 32`
- Ensure no extra spaces or newlines in the key

### "Failed to decrypt data"
- Verify the correct encryption key is being used
- Check if data was encrypted with a different key
- Verify data format is correct (iv:authTag:encryptedData)

## Compliance

This encryption implementation helps meet compliance requirements for:
- **GDPR**: Protection of personal data
- **PCI DSS**: Encryption of cardholder data
- **HIPAA**: Protection of PHI (if applicable)
- **SOC 2**: Data encryption controls

## Version History

- **v1.0.0**: Initial encryption implementation with AES-256-GCM
