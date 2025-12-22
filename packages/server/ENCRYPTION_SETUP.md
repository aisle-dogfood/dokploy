# Encryption Setup Guide

This application now encrypts sensitive secrets at the application layer to protect against database leakage.

## Encrypted Fields

The following sensitive fields are encrypted before being stored in the database:

### Notification System
- **Email passwords** (`email.password`)
- **Telegram bot tokens** (`telegram.botToken`)
- **Gotify app tokens** (`gotify.appToken`)

### Registry System
- **Registry passwords** (`registry.password`)

### Certificate System
- **Certificate private keys** (`certificate.privateKey`)

### Destination System (S3/Backup)
- **Secret access keys** (`destination.secretAccessKey`)

## Environment Setup

### Required Environment Variable

You **must** set the `ENCRYPTION_KEY` environment variable before running the application:

```bash
# Generate a secure random key (recommended)
export ENCRYPTION_KEY=$(openssl rand -base64 32)

# Or set it manually (minimum 32 characters recommended)
export ENCRYPTION_KEY="your-very-secure-encryption-key-here"
```

**Important Notes:**
- Keep this key secure and never commit it to version control
- If you lose this key, you will not be able to decrypt existing secrets
- Changing this key will require re-encryption of all existing secrets
- The same key must be used across all instances of the application

### Alternative Environment Variables

The encryption module will also check for these environment variables in order:
1. `ENCRYPTION_KEY` (recommended)
2. `SECRET_KEY`
3. `SECRET`

## Encryption Algorithm

- **Algorithm**: AES-256-GCM (Authenticated Encryption)
- **Key Derivation**: PBKDF2 with SHA-512 (100,000 iterations)
- **IV**: Random 16 bytes per encryption
- **Salt**: Random 64 bytes per encryption
- **Authentication**: 16-byte authentication tag

## Migration from Plaintext

The encryption module handles backward compatibility:

1. **New installations**: All sensitive data will be encrypted automatically
2. **Existing installations**: The decrypt function will detect plaintext data and log a warning
3. **Migration**: To re-encrypt existing plaintext data:
   - Update each record through the application's update API
   - The update functions will automatically encrypt the new values

## Security Best Practices

1. **Key Management**:
   - Store the encryption key in a secure key management system (KMS)
   - Use different keys for different environments (dev, staging, production)
   - Rotate keys periodically

2. **Backup Security**:
   - Ensure database backups are encrypted at rest
   - Store encryption keys separately from database backups
   - Implement strict access controls on backups

3. **Access Control**:
   - Implement RBAC (Role-Based Access Control)
   - Audit access to sensitive data
   - Never log decrypted secrets

4. **Monitoring**:
   - Monitor for failed decryption attempts
   - Set up alerts for unusual access patterns
   - Regular security audits

## API Response Security

Sensitive fields are excluded from API responses where possible:
- Registry passwords are not returned in `findRegistryById`
- Certificate private keys should be handled carefully
- Email passwords are only used internally for SMTP

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable is not set"

**Solution**: Set the `ENCRYPTION_KEY` environment variable before starting the application.

### Error: "Failed to decrypt data"

**Possible causes**:
1. The encryption key has changed
2. The data is corrupted
3. The data format is invalid

**Solution**: 
- Verify the encryption key is correct
- Check database integrity
- For development: clear the affected records and re-create them

### Warning: "Attempting to decrypt data that appears to be in plaintext format"

**Cause**: The data in the database is not encrypted (legacy data)

**Solution**: Update the record through the application API to encrypt it

## Development

### Testing Encryption

```typescript
import { encrypt, decrypt, isEncrypted } from "@dokploy/server/utils/encryption";

// Encrypt a value
const encrypted = encrypt("my-secret-password");
console.log("Encrypted:", encrypted);
console.log("Is encrypted:", isEncrypted(encrypted)); // true

// Decrypt a value
const decrypted = decrypt(encrypted);
console.log("Decrypted:", decrypted); // "my-secret-password"
```

### Key Rotation

To rotate encryption keys:

1. Keep the old key available
2. Set up the new key as `NEW_ENCRYPTION_KEY`
3. Use the `reencrypt()` function to migrate data
4. Update all instances to use the new key
5. Remove the old key

## Production Deployment

### Docker

```dockerfile
ENV ENCRYPTION_KEY=${ENCRYPTION_KEY}
```

### Docker Compose

```yaml
services:
  dokploy:
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
```

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: dokploy-encryption-key
type: Opaque
stringData:
  ENCRYPTION_KEY: your-base64-encoded-key
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: dokploy
        env:
        - name: ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: dokploy-encryption-key
              key: ENCRYPTION_KEY
```

## Compliance

This encryption implementation helps meet compliance requirements such as:
- GDPR (General Data Protection Regulation)
- HIPAA (Health Insurance Portability and Accountability Act)
- PCI DSS (Payment Card Industry Data Security Standard)
- SOC 2 (Service Organization Control 2)

However, always consult with your security and compliance teams for specific requirements.
