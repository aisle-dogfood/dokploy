# Encryption Quick Start Guide

Dokploy now encrypts all sensitive data at rest using AES-256-GCM encryption.

## For New Installations

1. **Generate an encryption key**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Add to your `.env` file**:
   ```bash
   ENCRYPTION_KEY=your_64_character_hex_key_here
   ```

3. **Deploy Dokploy**:
   ```bash
   npm install
   npm run build
   npm start
   ```

All sensitive data will be automatically encrypted from the start.

---

## For Existing Installations (Upgrade)

### 1. Backup Your Database
```bash
pg_dump dokploy > backup_$(date +%Y%m%d).sql
```

### 2. Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Update Environment
Add to your `.env` file:
```bash
ENCRYPTION_KEY=your_generated_64_char_hex_key
```

### 4. Deploy Updated Code
```bash
git pull
npm install
npm run build
```

### 5. Encrypt Existing Data
```bash
npm run encrypt-existing-data
```

This will encrypt all existing plaintext secrets in your database.

### 6. Verify
- Check application logs for any errors
- Test that all services are working correctly
- Verify secrets are being used properly

---

## Important Security Notes

⚠️ **CRITICAL**: 
- **Never commit the encryption key to version control**
- **Back up the encryption key separately from the database**
- **Losing the key means losing access to all encrypted data**
- **Use different keys for dev, staging, and production**

✅ **Best Practices**:
- Store keys in a secrets manager (AWS KMS, HashiCorp Vault, etc.)
- Rotate keys periodically
- Audit key access
- Document your key recovery process

---

## What Gets Encrypted?

The following sensitive data is now encrypted:

- ✅ TLS/SSL private keys and certificates
- ✅ SSH private keys
- ✅ S3/Cloud storage credentials
- ✅ Database passwords (MySQL, PostgreSQL, MariaDB, MongoDB, Redis)
- ✅ OAuth tokens (GitHub, GitLab, Bitbucket, Gitea)
- ✅ API keys and session tokens
- ✅ SMTP/Email passwords
- ✅ Registry passwords
- ✅ HTTP basic auth passwords
- ✅ Notification service tokens (Slack, Discord, Telegram, Gotify)
- ✅ Git provider secrets and webhooks

---

## Troubleshooting

### "ENCRYPTION_KEY environment variable is not set"
- Solution: Add `ENCRYPTION_KEY` to your `.env` file
- Development: A default key will be used (INSECURE for production!)

### "Failed to decrypt data"
- Verify `ENCRYPTION_KEY` is correct
- Check if migration was completed successfully
- Review logs for specific error details

### Performance
- Minimal overhead (~1ms per encryption/decryption)
- Database queries are not affected
- Transparent to application code

---

## More Information

For detailed documentation, see:
- [packages/server/ENCRYPTION.md](packages/server/ENCRYPTION.md) - Complete encryption documentation
- [SECURITY.md](SECURITY.md) - Security policy and features

## Support

If you encounter issues:
1. Check the logs for error details
2. Verify your encryption key is set correctly
3. Ensure migration completed without errors
4. Contact support at contact@dokploy.com
