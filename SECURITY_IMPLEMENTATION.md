# Security Implementation: At-Rest Encryption for Sensitive Data

## Overview

This document describes the implementation of at-rest encryption for sensitive credentials and secrets in the Dokploy application. This security enhancement addresses the vulnerability of plaintext storage of passwords, API keys, tokens, and other sensitive data.

## Architecture

### Encryption Layer

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│  (API endpoints, Services, Business Logic)                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Read/Write Operations
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     Drizzle ORM Layer                        │
│  Custom Column Type: encryptedText()                        │
│  ├─ toDriver(): encrypt(plaintext) → ciphertext             │
│  └─ fromDriver(): decrypt(ciphertext) → plaintext           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Encrypted Data
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                        │
│  Storage Format: TEXT (base64 encoded)                      │
│  Format: "iv:authTag:encryptedData"                         │
└─────────────────────────────────────────────────────────────┘
```

### Encryption Flow

```
Plaintext → AES-256-GCM → Base64 Encode → Store as TEXT
  ↑                                              ↓
  │                                              │
  └──────────────── Decrypt on Read ←───────────┘
```

## Components

### 1. Core Encryption Module
**File**: `packages/server/src/utils/encryption.ts`

**Functions**:
- `encrypt(plaintext: string): string` - Encrypts data using AES-256-GCM
- `decrypt(ciphertext: string): string` - Decrypts data
- `maskSecret(secret: string): string` - Masks secrets for display (future use)

**Features**:
- AES-256-GCM encryption with authenticated encryption
- Random IV generation per encryption operation
- Key derivation from environment variable using SHA-256
- Backward compatibility with plaintext data
- Graceful error handling

### 2. Custom Drizzle Column Type
**File**: `packages/server/src/db/schema/utils.ts`

**Column Type**: `encryptedText`

**Behavior**:
- **Write**: Automatically encrypts values before storing
- **Read**: Automatically decrypts values after retrieving
- **Transparent**: No changes needed in application code
- **Compatible**: Works with existing Drizzle queries

### 3. Schema Definitions

Updated schemas for all tables with sensitive data:

| Schema File | Tables | Encrypted Columns |
|-------------|--------|-------------------|
| `registry.ts` | registry | password |
| `notification.ts` | email, gotify, telegram, slack, discord | password, appToken, botToken, webhookUrl |
| `destination.ts` | destination | secretAccessKey |
| `ai.ts` | ai | apiKey |
| `postgres.ts` | postgres | databasePassword |
| `mysql.ts` | mysql | databasePassword, databaseRootPassword |
| `mariadb.ts` | mariadb | databasePassword, databaseRootPassword |
| `mongo.ts` | mongo | databasePassword |
| `redis.ts` | redis | databasePassword |
| `github.ts` | github | githubClientSecret, githubPrivateKey, githubWebhookSecret |
| `gitlab.ts` | gitlab | secret, accessToken, refreshToken |
| `gitea.ts` | gitea | clientSecret, accessToken, refreshToken |
| `bitbucket.ts` | bitbucket | appPassword |

## Implementation Details

### Encryption Algorithm: AES-256-GCM

**Why AES-256-GCM?**
1. **Industry Standard**: Widely adopted, thoroughly vetted
2. **Authenticated Encryption**: Provides both confidentiality and integrity
3. **NIST Approved**: Recommended by NIST for government use
4. **Performance**: Hardware-accelerated on most modern CPUs
5. **Security**: No known practical attacks against AES-256

**Parameters**:
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 128 bits (16 bytes) - randomly generated
- **Auth Tag**: 128 bits (16 bytes) - ensures integrity

### Storage Format

Encrypted data is stored as a base64-encoded string with three components:

```
[IV]:[Auth Tag]:[Encrypted Data]
```

**Example**:
```
qR3mK9pL2nO5cA8vB7dF1w==:xY4jT6rU3zP9mN2bV8cK1w==:aGVsbG8gd29ybGQgZW5jcnlwdGVk...
```

**Benefits**:
- Single TEXT column storage
- Easy to identify encrypted vs plaintext (contains `:`)
- Includes authentication tag for integrity verification
- Base64 encoding ensures database compatibility

### Key Management

**Environment Variable**: `ENCRYPTION_KEY`

**Key Derivation**:
```typescript
// SHA-256 hash of ENCRYPTION_KEY to ensure exactly 32 bytes
const key = crypto.createHash('sha256')
  .update(ENCRYPTION_KEY)
  .digest();
```

**Security Considerations**:
1. Key must be at least 32 characters (longer is better)
2. Should be randomly generated (use `openssl rand -hex 32`)
3. Must be stored securely (secrets manager in production)
4. Never logged or exposed in error messages
5. Should be different per environment (dev/staging/prod)

### Backward Compatibility

The implementation ensures seamless migration:

1. **Detection**: Checks if data contains `:` separator
2. **Plaintext Handling**: Returns as-is if not encrypted
3. **Error Recovery**: Falls back to ciphertext on decryption failure
4. **Progressive Migration**: Encrypts on next write
5. **No Downtime**: Works with mixed encrypted/plaintext data

**Migration Logic**:
```typescript
function decrypt(ciphertext: string): string {
  if (!ciphertext.includes(':')) {
    // Plaintext data, return as-is
    return ciphertext;
  }
  
  try {
    // Decrypt encrypted data
    return performDecryption(ciphertext);
  } catch (error) {
    // Decryption failed, return original
    // (may be plaintext with colons or corrupted)
    return ciphertext;
  }
}
```

## Security Properties

### Confidentiality
- ✅ Secrets encrypted at rest
- ✅ AES-256 encryption (unbreakable with current technology)
- ✅ Key stored separately from data

### Integrity
- ✅ GCM mode provides authentication
- ✅ Tampering detection via auth tag
- ✅ Failed authentication prevents decryption

### Availability
- ✅ Backward compatible with existing data
- ✅ Graceful degradation if key missing
- ✅ No single point of failure

### Defense in Depth
1. **Database Level**: Data encrypted in DB
2. **Application Level**: Automatic encryption/decryption
3. **Key Management**: Separate key storage
4. **Access Control**: Database access restrictions
5. **Transport Security**: TLS for connections

## Testing

### Test Script
**File**: `packages/server/src/utils/test-encryption.ts`

**Run**:
```bash
export ENCRYPTION_KEY=$(openssl rand -hex 32)
tsx packages/server/src/utils/test-encryption.ts
```

**Tests**:
- ✓ Encryption key presence
- ✓ Encryption/decryption cycle
- ✓ Format validation (iv:tag:data)
- ✓ Backward compatibility with plaintext
- ✓ Edge cases (empty strings, special characters)

### Manual Verification

1. **Encrypted Data Format**:
```sql
-- Should show format: "xxx:yyy:zzz"
SELECT password FROM registry LIMIT 1;
```

2. **Decryption Works**:
```typescript
// Through the application
const registry = await findRegistryById('xxx');
console.log(registry.password); // Should be plaintext
```

3. **New Data Encrypted**:
```sql
-- After creating new registry
SELECT password FROM registry ORDER BY "createdAt" DESC LIMIT 1;
-- Should be encrypted
```

## Deployment

### Prerequisites

1. **Generate Encryption Key**:
```bash
openssl rand -hex 32
```

2. **Set Environment Variable**:
```bash
# Development
export ENCRYPTION_KEY="your-key-here"

# Production (use secrets manager)
aws secretsmanager get-secret-value --secret-id dokploy/encryption-key
```

### Deployment Steps

#### New Installation
1. Set `ENCRYPTION_KEY` before first run
2. Deploy application
3. All new data automatically encrypted

#### Existing Installation
1. **Backup database**
2. Set `ENCRYPTION_KEY`
3. Restart application
4. (Optional) Run migration script for bulk encryption
5. Verify encryption working

### Migration Script
**File**: `packages/server/src/utils/encryption-migration.ts`

**Run**:
```bash
cd packages/server
export ENCRYPTION_KEY="your-key-here"
tsx src/utils/encryption-migration.ts
```

**What it does**:
- Identifies plaintext data (not matching encrypted format)
- Encrypts all sensitive fields in all tables
- Provides progress logging
- Verifies encryption success

## Monitoring & Operations

### Health Checks

1. **Encryption Key Status**:
```typescript
// Check if encryption is enabled
const isEncrypted = !!process.env.ENCRYPTION_KEY;
```

2. **Encryption Format Validation**:
```sql
-- Count non-encrypted passwords
SELECT COUNT(*) FROM registry 
WHERE password NOT LIKE '%:%:%';
```

### Logging

**Current Implementation**:
- Warning logged if `ENCRYPTION_KEY` not set
- Decryption errors logged (not the secret)
- Migration progress logged

**Future Enhancements**:
- Audit trail for sensitive field access
- Failed decryption attempt monitoring
- Key rotation events

### Performance Monitoring

**Expected Impact**: Minimal
- Encryption/decryption: ~0.1-1ms per field
- Happens at ORM layer, cached by connection pooling
- Parallel processing possible

**Monitor**:
- Query execution time
- Database connection pool usage
- Application memory usage

## Maintenance

### Key Rotation

**Process** (manual, for future automation):
1. Generate new key
2. Deploy with both old and new keys
3. Re-encrypt all data with new key
4. Remove old key after verification
5. Update all environments

### Backup Strategy

**Critical**:
- Backup encryption key separately from database
- Encrypted backups are useless without the key
- Use secrets manager with backup/recovery

**Recommendations**:
1. Store key in multiple secure locations
2. Document key recovery procedure
3. Test key recovery regularly
4. Encrypt database backups separately

### Troubleshooting

**Issue**: Data appears encrypted in UI
- **Cause**: Missing or incorrect `ENCRYPTION_KEY`
- **Fix**: Set correct key and restart

**Issue**: Decryption errors in logs
- **Cause**: Key changed or data corrupted
- **Fix**: Restore correct key or data from backup

**Issue**: Performance degradation
- **Cause**: High encryption overhead (unlikely)
- **Fix**: Increase connection pool, add caching

## Compliance

This implementation helps meet requirements for:

- **PCI DSS**: Encryption of cardholder data at rest
- **GDPR**: Appropriate technical measures for data protection
- **HIPAA**: Encryption of ePHI at rest
- **SOC 2**: Confidentiality and security criteria
- **ISO 27001**: Cryptographic controls

## Future Enhancements

### Planned
1. **Key Rotation**: Automated key rotation with versioning
2. **HSM Support**: Hardware security module integration
3. **Audit Logging**: Comprehensive access logs
4. **Field Masking**: Auto-mask in logs and errors

### Under Consideration
1. **Row-Level Security**: PostgreSQL RLS for additional protection
2. **Client-Side Encryption**: Encrypt before sending to server
3. **Key Escrow**: Secure key recovery mechanism
4. **Tokenization**: For certain high-security fields

## References

- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final) - GCM Specification
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [Drizzle ORM Custom Types](https://orm.drizzle.team/docs/custom-types)
