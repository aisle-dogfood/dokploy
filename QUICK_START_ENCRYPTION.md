# Quick Start: Encryption Setup

## TL;DR

This application now encrypts sensitive data (passwords, API keys, tokens) at rest. You need to set an encryption key.

## Quick Setup

### 1. Generate an Encryption Key

```bash
openssl rand -hex 32
```

### 2. Set Environment Variable

```bash
# Copy to your .env file or export
export ENCRYPTION_KEY="<generated-key-from-step-1>"
```

### 3. Restart Application

```bash
# The application will now encrypt all new sensitive data
npm start
```

## For Existing Installations

If you already have data in the database:

### Option A: Gradual Migration (Recommended)
- Set the `ENCRYPTION_KEY`
- Restart the application
- Existing plaintext data will work as-is
- Data gets encrypted when updated through the UI

### Option B: Bulk Migration
```bash
# Set the encryption key first
export ENCRYPTION_KEY="your-key-here"

# Run the migration script
cd packages/server
tsx src/utils/encryption-migration.ts
```

## Verify It's Working

### Test the encryption:
```bash
export ENCRYPTION_KEY="your-key-here"
tsx packages/server/src/utils/test-encryption.ts
```

### Check the database:
```sql
-- Encrypted data looks like: "abc123:def456:xyz789..."
SELECT password FROM registry LIMIT 1;
```

## Important Notes

⚠️ **CRITICAL**: 
- **Backup your database** before migration
- **Save the encryption key** securely (you'll need it to decrypt data)
- If you lose the key, encrypted data **cannot be recovered**

✅ **Best Practices**:
- Use different keys for dev/staging/production
- Store keys in a secrets manager (AWS Secrets Manager, Vault, etc.)
- Never commit keys to version control
- Generate keys with at least 32 characters (longer is better)

## What Gets Encrypted?

All sensitive fields including:
- Passwords (registries, databases, SMTP)
- API keys (AI providers)
- Tokens (bot tokens, access tokens)
- Secrets (OAuth secrets, webhook URLs)
- Cloud credentials (AWS secret keys)

## Troubleshooting

**"Data looks like gibberish"**
→ That's normal! Encrypted data is base64-encoded

**"Application won't start"**
→ Check that `ENCRYPTION_KEY` is set correctly

**"Migration script fails"**
→ Ensure `ENCRYPTION_KEY` is set and database is accessible

**"Getting decryption errors"**
→ Make sure you're using the same `ENCRYPTION_KEY` that was used to encrypt the data

## Need Help?

- Full documentation: `packages/server/ENCRYPTION_GUIDE.md`
- Implementation details: `SECURITY_IMPLEMENTATION.md`
- Test your setup: `tsx packages/server/src/utils/test-encryption.ts`

## Production Deployment

For production, use a secrets manager:

**AWS**:
```bash
ENCRYPTION_KEY=$(aws secretsmanager get-secret-value \
  --secret-id dokploy/encryption-key \
  --query SecretString \
  --output text)
```

**Docker**:
```yaml
services:
  app:
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    # Or use Docker secrets
    secrets:
      - encryption_key
```

**Kubernetes**:
```yaml
env:
  - name: ENCRYPTION_KEY
    valueFrom:
      secretKeyRef:
        name: dokploy-secrets
        key: encryption-key
```

## Example .env File

```bash
DATABASE_URL="postgres://user:pass@localhost:5432/dokploy"
PORT=3000
NODE_ENV=production

# Generate with: openssl rand -hex 32
ENCRYPTION_KEY="your-secure-random-encryption-key-here"
```

That's it! Your sensitive data is now encrypted at rest. 🔒
