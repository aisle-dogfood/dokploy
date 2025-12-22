# Database Encryption Setup

## Overview

Sensitive fields in the database are now encrypted at rest using AES-256-GCM encryption. This protects sensitive data such as:

- Private keys (TLS/SSH certificates)
- API tokens and keys
- Database passwords
- Session tokens
- OAuth tokens
- Registry passwords
- SMTP passwords
- Third-party service tokens

## Environment Setup

### Required Environment Variable

You **must** set the `ENCRYPTION_KEY` environment variable in production:

```bash
# Generate a secure random key (at least 32 characters recommended)
export ENCRYPTION_KEY="your-secure-random-key-here"
```

### Generating a Secure Key

Use one of these methods to generate a secure encryption key:

```bash
# Method 1: Using OpenSSL
openssl rand -base64 32

# Method 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Method 3: Using /dev/urandom
head -c 32 /dev/urandom | base64
```

### Important Security Notes

1. **Key Storage**: Store the encryption key securely:
   - Use environment variables (not hardcoded in code)
   - Use a secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager)
   - Never commit the key to version control

2. **Key Rotation**: If you need to rotate the encryption key:
   - The old key must be available to decrypt existing data
   - Implement a migration script to re-encrypt data with the new key
   - Update the `ENCRYPTION_KEY` environment variable

3. **Backup**: Back up your encryption key securely:
   - Loss of the encryption key means permanent data loss
   - Store backups in a secure, separate location

4. **Development vs Production**:
   - Development: A default key is used if `ENCRYPTION_KEY` is not set (NOT SECURE)
   - Production: Always set `ENCRYPTION_KEY` explicitly

## Data Migration

### For New Installations

No action required. All sensitive data will be encrypted automatically when stored.

### For Existing Installations

If you're upgrading from a version without encryption:

1. **Set the encryption key**:
   ```bash
   export ENCRYPTION_KEY="$(openssl rand -base64 32)"
   ```

2. **Back up your database** before proceeding:
   ```bash
   pg_dump dokploy > backup_before_encryption.sql
   ```

3. **Run the encryption migration**:
   The application will automatically encrypt plaintext values on first read/write.
   
   Alternatively, create a migration script to batch-encrypt existing data:
   ```typescript
   // Example migration script (to be run once)
   import { db } from "./db";
   import { encrypt } from "./utils/encryption";
   
   // This is a simplified example - actual implementation may vary
   async function migrateExistingData() {
     // Read and re-save records to trigger encryption
     const records = await db.query.certificates.findMany();
     for (const record of records) {
       await db.update(certificates)
         .set({ 
           privateKey: record.privateKey,
           certificateData: record.certificateData 
         })
         .where(eq(certificates.certificateId, record.certificateId));
     }
   }
   ```

4. **Verify encryption**:
   - Check that values in the database are now base64-encoded encrypted strings
   - Verify that the application can still read and decrypt the values correctly

## Encrypted Fields

The following database fields are now encrypted:

### Authentication & Sessions
- `session_temp.token`
- `account.access_token`
- `account.refresh_token`
- `account.id_token`
- `apikey.key`
- `two_factor.secret`
- `two_factor.backup_codes`

### Certificates & Keys
- `certificate.privateKey`
- `certificate.certificateData`
- `ssh-key.privateKey`
- `user_temp.sshPrivateKey`

### Cloud & Infrastructure
- `destination.accessKey`
- `destination.secretAccessKey`

### Databases
- `postgres.databasePassword`
- `mysql.databasePassword`
- `mysql.rootPassword`
- `mariadb.databasePassword`
- `mariadb.rootPassword`
- `mongo.databasePassword`
- `redis.password` (stored in column named "password")

### Registries & Applications
- `registry.password`
- `application.password`
- `security.password`

### Notifications
- `email.password`
- `telegram.botToken`
- `gotify.appToken`

### AI Services
- `ai.apiKey`

## Technical Details

### Encryption Algorithm

- **Algorithm**: AES-256-GCM
- **Key Derivation**: scrypt with salt
- **Authentication**: GCM provides authenticated encryption
- **Format**: `base64(salt + iv + auth_tag + encrypted_data)`

### Implementation

The encryption is transparent to application code:
- **Write**: Data is automatically encrypted before storing in the database
- **Read**: Data is automatically decrypted when retrieved from the database

Custom Drizzle column type: `encryptedText(columnName)`

```typescript
import { encryptedText } from "./db/schema/encrypted";

// In schema definition
export const myTable = pgTable("my_table", {
  sensitiveField: encryptedText("sensitive_field").notNull(),
});
```

## Troubleshooting

### Error: "Failed to decrypt data"

**Causes**:
- Wrong encryption key being used
- Data was encrypted with a different key
- Database corruption

**Solutions**:
1. Verify the `ENCRYPTION_KEY` environment variable is correct
2. Check if the key was recently changed
3. Restore from backup if data is corrupted

### Error: "ENCRYPTION_KEY environment variable not set"

**Solution**: Set the environment variable before starting the application:
```bash
export ENCRYPTION_KEY="your-key-here"
```

### Performance Considerations

- Encryption/decryption adds minimal overhead (< 1ms per operation)
- Indexed searches on encrypted fields are not possible
- Consider this when designing queries

## Compliance

This encryption implementation helps meet compliance requirements for:
- PCI DSS (Payment Card Industry Data Security Standard)
- GDPR (General Data Protection Regulation)
- HIPAA (Health Insurance Portability and Accountability Act)
- SOC 2 (Service Organization Control 2)

**Note**: Encryption at rest is one layer of security. Also implement:
- Encryption in transit (TLS/HTTPS)
- Access controls and authentication
- Audit logging
- Regular security assessments
