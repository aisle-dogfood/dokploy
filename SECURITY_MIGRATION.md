# Security Migration Guide: Database Encryption

## Overview

This guide helps you migrate your Dokploy installation to use encrypted storage for sensitive data.

## What Changed?

All sensitive data (passwords, keys, tokens, secrets) is now automatically encrypted at rest in the database using AES-256-GCM encryption.

## Pre-Migration Checklist

1. **Backup your database** before proceeding:
   ```bash
   # PostgreSQL backup example
   pg_dump dokploy > dokploy_backup_$(date +%Y%m%d).sql
   ```

2. **Generate an encryption key**:
   ```bash
   openssl rand -hex 32
   ```

3. **Store the key securely**:
   - Add to your environment variables
   - Use a secrets management system (HashiCorp Vault, AWS Secrets Manager, etc.)
   - **NEVER** commit the key to version control

## Migration Steps

### 1. Set the Encryption Key

Add the `ENCRYPTION_KEY` environment variable to your deployment:

**Docker Compose:**
```yaml
environment:
  - ENCRYPTION_KEY=your_generated_32_byte_hex_key_here
```

**Docker Run:**
```bash
docker run -e ENCRYPTION_KEY=your_generated_32_byte_hex_key_here ...
```

**Kubernetes:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: dokploy-secrets
stringData:
  encryption-key: your_generated_32_byte_hex_key_here
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
              name: dokploy-secrets
              key: encryption-key
```

### 2. Restart Dokploy

After setting the encryption key, restart your Dokploy instance:

```bash
docker-compose restart
# or
kubectl rollout restart deployment/dokploy
```

### 3. Verify Encryption is Active

Check the logs for encryption initialization:
```bash
docker-compose logs | grep -i encryption
# or
kubectl logs deployment/dokploy | grep -i encryption
```

You should NOT see: `"WARNING: ENCRYPTION_KEY not set"`

### 4. Re-encrypt Existing Data (Optional but Recommended)

The system has backward compatibility for existing plaintext data, but for maximum security, trigger re-encryption:

```sql
-- Connect to your database
psql -U dokploy -d dokploy

-- Re-encrypt existing sensitive data by updating records
-- Registry passwords
UPDATE registry SET password = password WHERE password IS NOT NULL;

-- Certificate private keys
UPDATE certificate SET "privateKey" = "privateKey" WHERE "privateKey" IS NOT NULL;

-- SSH keys
UPDATE "ssh-key" SET "privateKey" = "privateKey" WHERE "privateKey" IS NOT NULL;

-- Database passwords
UPDATE postgres SET "databasePassword" = "databasePassword" WHERE "databasePassword" IS NOT NULL;
UPDATE mysql SET "databasePassword" = "databasePassword", "rootPassword" = "rootPassword" WHERE "databasePassword" IS NOT NULL;
UPDATE mariadb SET "databasePassword" = "databasePassword", "rootPassword" = "rootPassword" WHERE "databasePassword" IS NOT NULL;
UPDATE mongo SET "databasePassword" = "databasePassword" WHERE "databasePassword" IS NOT NULL;
UPDATE redis SET password = password WHERE password IS NOT NULL;

-- Email passwords
UPDATE email SET password = password WHERE password IS NOT NULL;

-- Notification webhooks and tokens
UPDATE slack SET "webhookUrl" = "webhookUrl" WHERE "webhookUrl" IS NOT NULL;
UPDATE telegram SET "botToken" = "botToken" WHERE "botToken" IS NOT NULL;
UPDATE discord SET "webhookUrl" = "webhookUrl" WHERE "webhookUrl" IS NOT NULL;
UPDATE gotify SET "appToken" = "appToken" WHERE "appToken" IS NOT NULL;

-- Git provider secrets
UPDATE github SET "githubClientSecret" = "githubClientSecret" WHERE "githubClientSecret" IS NOT NULL;
UPDATE github SET "githubPrivateKey" = "githubPrivateKey" WHERE "githubPrivateKey" IS NOT NULL;
UPDATE github SET "githubWebhookSecret" = "githubWebhookSecret" WHERE "githubWebhookSecret" IS NOT NULL;
UPDATE gitlab SET secret = secret WHERE secret IS NOT NULL;
UPDATE gitlab SET access_token = access_token WHERE access_token IS NOT NULL;
UPDATE gitlab SET refresh_token = refresh_token WHERE refresh_token IS NOT NULL;
UPDATE bitbucket SET "appPassword" = "appPassword" WHERE "appPassword" IS NOT NULL;
UPDATE gitea SET client_secret = client_secret WHERE client_secret IS NOT NULL;
UPDATE gitea SET access_token = access_token WHERE access_token IS NOT NULL;
UPDATE gitea SET refresh_token = refresh_token WHERE refresh_token IS NOT NULL;

-- OAuth tokens
UPDATE account SET access_token = access_token WHERE access_token IS NOT NULL;
UPDATE account SET refresh_token = refresh_token WHERE refresh_token IS NOT NULL;
UPDATE account SET id_token = id_token WHERE id_token IS NOT NULL;
UPDATE account SET "resetPasswordToken" = "resetPasswordToken" WHERE "resetPasswordToken" IS NOT NULL;
UPDATE account SET "confirmationToken" = "confirmationToken" WHERE "confirmationToken" IS NOT NULL;

-- API keys and 2FA
UPDATE apikey SET key = key WHERE key IS NOT NULL;
UPDATE two_factor SET secret = secret WHERE secret IS NOT NULL;
UPDATE two_factor SET backup_codes = backup_codes WHERE backup_codes IS NOT NULL;

-- Destination keys
UPDATE destination SET "accessKey" = "accessKey" WHERE "accessKey" IS NOT NULL;
UPDATE destination SET "secretAccessKey" = "secretAccessKey" WHERE "secretAccessKey" IS NOT NULL;

-- Security passwords
UPDATE security SET password = password WHERE password IS NOT NULL;

-- User SSH keys
UPDATE user_temp SET "sshPrivateKey" = "sshPrivateKey" WHERE "sshPrivateKey" IS NOT NULL;
```

## Post-Migration Verification

### 1. Test Functionality

Verify that all features work correctly:
- [ ] Login/logout
- [ ] Deploy applications
- [ ] Connect to databases
- [ ] Git provider integration
- [ ] Notifications
- [ ] Registry access
- [ ] SSH key usage

### 2. Check Encrypted Data

Verify data is encrypted in the database:
```sql
-- Sample check (encrypted data will look like hex strings with colons)
SELECT "registryId", LEFT(password, 50) as encrypted_password_sample 
FROM registry 
LIMIT 1;

-- Encrypted format: iv:authTag:encryptedData
-- Example: a1b2c3d4e5f6....:1234567890ab....:f9e8d7c6b5a4....
```

## Rollback Procedure

If you need to rollback:

1. **Restore from backup**:
   ```bash
   psql -U dokploy -d dokploy < dokploy_backup_YYYYMMDD.sql
   ```

2. **Remove the encryption key** from environment variables

3. **Restart Dokploy**

⚠️ **Warning**: Do NOT rollback after re-encrypting data without restoring from backup, as the data will be encrypted and inaccessible.

## Key Rotation

To rotate the encryption key:

1. **Generate a new key**:
   ```bash
   openssl rand -hex 32
   ```

2. **Decrypt data with old key** (keep old key temporarily)

3. **Set new key** in environment

4. **Re-encrypt all data** using the SQL commands above

5. **Remove old key** from environment

## Troubleshooting

### "Decryption failed" warnings

**Cause**: Encryption key mismatch or corrupted data

**Solution**:
1. Verify `ENCRYPTION_KEY` is correct
2. Check if key was changed after encryption
3. Restore from backup if necessary

### Data appears as encrypted strings

**Cause**: Application not loading encryption key properly

**Solution**:
1. Verify `ENCRYPTION_KEY` environment variable is set
2. Check application logs for errors
3. Restart the application

### Performance degradation

**Cause**: Unlikely with AES-GCM, but check:
- Database query patterns
- Network latency
- Resource constraints

## Security Best Practices

1. **Key Management**:
   - Store keys in a secrets management system
   - Use different keys for different environments
   - Never log or display the encryption key
   - Rotate keys periodically (e.g., annually)

2. **Access Control**:
   - Limit database access to necessary services only
   - Use strong database passwords
   - Enable database SSL/TLS
   - Regular security audits

3. **Monitoring**:
   - Monitor for failed decryption attempts
   - Alert on encryption key changes
   - Regular backup verification

4. **Compliance**:
   - Document key rotation procedures
   - Maintain audit logs
   - Follow your organization's data protection policies

## Support

For issues during migration:
1. Check application logs
2. Review this guide
3. Restore from backup if necessary
4. Open an issue with:
   - Error messages (redact sensitive data)
   - Migration step where issue occurred
   - Environment details

## Additional Resources

- [Encryption Implementation Details](packages/server/ENCRYPTION.md)
- [Security Best Practices](SECURITY.md)
- [Database Backup Guide](docs/backup.md)
