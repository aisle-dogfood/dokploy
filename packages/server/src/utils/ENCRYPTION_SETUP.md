# Encryption Setup Guide

## Overview

Dokploy now implements application-layer encryption for sensitive data stored in the database. This protects credentials, API keys, tokens, and other sensitive information from being exposed in case of database or backup leaks.

## Environment Setup

### Required Environment Variable

You MUST set the `ENCRYPTION_KEY` environment variable before starting Dokploy. This key is used to encrypt and decrypt sensitive data.

```bash
# Generate a secure 32-byte encryption key
openssl rand -hex 32
```

Add the generated key to your `.env` file:

```bash
ENCRYPTION_KEY=your_64_character_hex_string_here
```

### Important Security Considerations

1. **Key Generation**: Always use a cryptographically secure random key. Never use predictable values or reuse keys from other systems.

2. **Key Storage**: 
   - Store the encryption key securely
   - Never commit the key to version control
   - Use secrets management systems in production (e.g., HashiCorp Vault, AWS Secrets Manager)
   - For Docker deployments, use Docker secrets or encrypted environment files

3. **Key Rotation**: 
   - If you need to rotate the encryption key, you'll need to:
     - Decrypt all existing data with the old key
     - Re-encrypt with the new key
     - Update the ENCRYPTION_KEY environment variable
   - Plan for key rotation in your security policies

4. **Backup Considerations**:
   - Database backups contain encrypted data
   - You MUST backup the encryption key separately
   - Without the key, encrypted data cannot be recovered

## Encrypted Fields

The following sensitive fields are now encrypted at rest:

### Certificates
- `certificate.privateKey` - SSL/TLS private keys (encrypted)

### Cloud Storage Destinations
- `destination.secretAccessKey` - S3/cloud storage secret keys (encrypted)

### Container Registries
- `registry.password` - Docker registry passwords (encrypted)

### Email Configuration
- `email.password` - SMTP passwords (encrypted)

### SSH Keys
- `ssh-key.privateKey` - SSH private keys (encrypted)

### Database Passwords
- `mysql.databasePassword` - MySQL user passwords (encrypted)
- `mysql.databaseRootPassword` - MySQL root passwords (encrypted)
- `mariadb.databasePassword` - MariaDB user passwords (encrypted)
- `mariadb.databaseRootPassword` - MariaDB root passwords (encrypted)
- `mongo.databasePassword` - MongoDB passwords (encrypted)
- `postgres.databasePassword` - PostgreSQL passwords (encrypted)
- `redis.databasePassword` - Redis passwords (encrypted)

### Application Security
- `security.password` - HTTP Basic Auth passwords (bcrypt hashed, one-way)

## Hashed vs Encrypted

- **Encrypted fields** (AES-256-GCM): Can be decrypted when needed (e.g., to connect to databases)
- **Hashed fields** (bcrypt): Cannot be decrypted, only verified (e.g., HTTP Basic Auth passwords)

## Session Tokens and API Keys

Session tokens and API keys are managed by the better-auth library, which implements its own secure hashing and verification mechanisms. These are not affected by the ENCRYPTION_KEY.

## Migration from Plaintext

When upgrading to this version:

1. Existing plaintext data will be automatically encrypted on next write
2. The system can detect and handle both encrypted and plaintext data during the transition
3. For maximum security, rotate all sensitive credentials after enabling encryption

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable is not set"
- Set the ENCRYPTION_KEY environment variable with a 64-character hex string
- Generate one using: `openssl rand -hex 32`

### Error: "ENCRYPTION_KEY must be a 32-byte (64 character) hex string"
- The key must be exactly 64 hexadecimal characters (32 bytes)
- Use the command above to generate a valid key

### Error: "Decryption failed"
- The encryption key has changed or is incorrect
- Restore the original encryption key
- If the key is lost, encrypted data cannot be recovered

## Security Best Practices

1. **Least Privilege**: Limit access to the encryption key to only necessary services
2. **Monitoring**: Monitor access to encrypted fields and implement audit logging
3. **Regular Rotation**: Implement a key rotation policy (e.g., annually)
4. **Secure Communication**: Always use TLS/SSL for database connections
5. **Access Control**: Implement proper RBAC in your application layer
6. **Audit Trails**: Enable database audit logging for sensitive table access

## Additional Recommendations

1. **Enable RLS**: If possible, enable PostgreSQL Row-Level Security (RLS) for defense in depth
2. **Network Isolation**: Keep your database in a private network
3. **Regular Backups**: Maintain encrypted backups of both data and keys (separately)
4. **Security Scanning**: Regularly scan for vulnerabilities and exposed secrets
5. **Incident Response**: Have a plan for handling potential key compromise

## Compliance Considerations

This encryption implementation helps meet compliance requirements for:
- PCI DSS (Payment Card Industry Data Security Standard)
- GDPR (General Data Protection Regulation)
- HIPAA (Health Insurance Portability and Accountability Act)
- SOC 2 Type II

Always consult with your compliance team to ensure all requirements are met.
