# Dokploy Security Policy

At Dokploy, security is a top priority. We appreciate the help of security researchers and the community in identifying and reporting vulnerabilities.

## How to Report a Vulnerability

If you have discovered a security vulnerability in Dokploy, we ask that you report it responsibly by following these guidelines:

1.  **Contact us:** Send an email to [contact@dokploy.com](mailto:contact@dokploy.com).
2.  **Provide clear details:** Include as much information as possible to help us understand and reproduce the vulnerability. This should include:
    *   A clear description of the vulnerability.
    *   Steps to reproduce the vulnerability.
    *   Any sample code, screenshots, or videos that might be helpful.
    *   The potential impact of the vulnerability.
3.  **Do not make the vulnerability public:** Please refrain from publicly disclosing the vulnerability until we have had the opportunity to investigate and address it. This is crucial for protecting our users.
4.  **Allow us time:** We will endeavor to acknowledge receipt of your report as soon as possible and keep you informed of our progress. The time to resolve the vulnerability may vary depending on its complexity and severity.

## What We Expect From You

*   Do not access user data or systems beyond what is necessary to demonstrate the vulnerability.
*   Do not perform denial-of-service (DoS) attacks, spamming, or social engineering.
*   Do not modify or destroy data that does not belong to you.

## Our Commitment

We are committed to working with you quickly and responsibly to address any legitimate security vulnerability.

Thank you for helping us keep Dokploy secure for everyone.

---

## Security Features

### Encryption at Rest for Sensitive Data

Dokploy implements AES-256-GCM encryption for all sensitive data stored in the database. This includes:

- TLS/SSL private keys and certificates
- SSH private keys  
- Cloud storage credentials (S3 access keys, secret keys)
- Database passwords (MySQL, PostgreSQL, MariaDB, MongoDB, Redis)
- OAuth tokens (access tokens, refresh tokens, ID tokens)
- API keys and session tokens
- SMTP passwords
- Registry passwords
- HTTP basic auth credentials
- Git provider secrets (GitHub, GitLab, Bitbucket, Gitea)
- Notification service tokens (Slack, Discord, Telegram, Gotify)

For detailed information on the encryption implementation, key management, and migration guide, see [packages/server/ENCRYPTION.md](packages/server/ENCRYPTION.md).

### Security Best Practices

1. **Encryption Key Management**: 
   - Always use a strong, randomly generated encryption key
   - Store keys in a secure secrets manager (e.g., AWS KMS, HashiCorp Vault)
   - Use different keys for different environments (dev, staging, production)
   - Back up encryption keys securely and separately from database backups

2. **Environment Variables**:
   - Never commit sensitive environment variables to version control
   - Use `.env` files locally and secure secrets managers in production
   - Regularly rotate sensitive credentials

3. **Database Backups**:
   - Database backups contain encrypted data
   - Store backups securely with appropriate access controls
   - Keep encryption keys backed up separately

4. **Access Control**:
   - Limit access to the application server and database
   - Use strong authentication mechanisms
   - Implement principle of least privilege

5. **Updates and Patches**:
   - Keep Dokploy and all dependencies up to date
   - Subscribe to security advisories
   - Test updates in staging before production deployment
