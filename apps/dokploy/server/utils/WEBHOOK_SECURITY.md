# Webhook Security Documentation

## Overview

This document describes the security measures implemented for webhook endpoints in Dokploy to prevent unauthorized access and abuse.

## Security Features

### 1. Provider Signature Verification

Webhooks from Git providers (GitHub, GitLab, Gitea) are now verified using cryptographic signatures to ensure they originate from the legitimate provider.

#### GitHub Webhook Verification
- Uses HMAC SHA-256 signature verification
- Verifies the `X-Hub-Signature-256` header
- Requires `githubWebhookSecret` to be configured in the GitHub provider settings
- Leverages the `@octokit/webhooks` library for verification

#### GitLab Webhook Verification
- Uses secret token verification
- Verifies the `X-Gitlab-Token` header
- Uses timing-safe comparison to prevent timing attacks
- Requires GitLab `secret` to be configured in the GitLab provider settings

#### Gitea Webhook Verification
- Uses HMAC SHA-256 signature verification
- Verifies the `X-Gitea-Signature` header
- Requires Gitea `clientSecret` to be configured in the Gitea provider settings

### 2. Rate Limiting

Rate limiting prevents brute-force attacks and abuse of webhook endpoints.

**Configuration:**
- 30 requests per minute per unique token + IP combination
- Separate rate limits for applications and compose deployments
- In-memory storage (consider Redis for production clusters)
- Automatic cleanup of expired rate limit entries

**Implementation Details:**
- Rate limit key format: `{type}:{refreshToken}:{clientIP}`
- Returns HTTP 429 (Too Many Requests) when limit is exceeded
- Window resets after 1 minute

### 3. IP Address Tracking

Client IP addresses are extracted and used for rate limiting, supporting common proxy headers:
- `X-Forwarded-For` (first IP in the chain)
- `X-Real-IP`
- Socket remote address (fallback)

### 4. Backward Compatibility

The security measures are designed to be backward compatible:
- If no webhook secret is configured for a provider, signature verification is skipped
- The `refreshToken` URL parameter continues to work as before
- Rate limiting is always enforced regardless of signature verification setup

## Configuration

### Setting up GitHub Webhook Security

1. In GitHub App settings, generate a webhook secret
2. Configure the secret in Dokploy's GitHub provider settings
3. GitHub will send webhooks with `X-Hub-Signature-256` header
4. Dokploy will verify the signature automatically

### Setting up GitLab Webhook Security

1. In GitLab webhook settings, set a secret token
2. Configure the same token in Dokploy's GitLab provider settings (`secret` field)
3. GitLab will send webhooks with `X-Gitlab-Token` header
4. Dokploy will verify the token automatically

### Setting up Gitea Webhook Security

1. In Gitea webhook settings, set a secret
2. Use the same value as the Gitea OAuth `clientSecret` in Dokploy
3. Gitea will send webhooks with `X-Gitea-Signature` header
4. Dokploy will verify the signature automatically

## Security Recommendations

1. **Always configure webhook secrets** - While optional for backward compatibility, webhook secrets are strongly recommended
2. **Rotate refresh tokens periodically** - The URL-based `refreshToken` should be rotated regularly
3. **Monitor rate limit violations** - Excessive rate limit violations may indicate an attack
4. **Consider IP allowlisting** - For highly sensitive deployments, implement IP allowlisting (infrastructure provided, implementation pending)
5. **Use HTTPS** - Always use HTTPS for webhook URLs to prevent man-in-the-middle attacks
6. **Audit logs** - Consider implementing audit logging for webhook requests

## Production Considerations

### Rate Limiting Storage

The current implementation uses an in-memory Map for rate limiting. For production deployments with multiple instances:

1. **Use Redis for distributed rate limiting:**
   ```typescript
   // Example Redis-based rate limiting
   import Redis from 'ioredis';
   const redis = new Redis(process.env.REDIS_URL);
   
   async function isRateLimited(identifier: string): Promise<boolean> {
     const key = `ratelimit:${identifier}`;
     const count = await redis.incr(key);
     
     if (count === 1) {
       await redis.expire(key, 60); // 1 minute window
     }
     
     return count > 30; // max 30 requests
   }
   ```

2. **Or use a database-backed solution** for persistence and auditing

### IP Allowlisting

For additional security, implement IP allowlisting:

```typescript
// Add to compose/application schema
allowedWebhookIps: text("allowed_webhook_ips").array(),

// Use in webhook handler
if (!isIpAllowed(clientIp, composeResult.allowedWebhookIps)) {
  res.status(403).json({ message: "IP address not allowed" });
  return;
}
```

## Migration Guide

Existing webhook URLs will continue to work without any changes. To enable enhanced security:

1. **For GitHub:**
   - Ensure your GitHub App has a webhook secret configured
   - The secret is already stored in the `github.githubWebhookSecret` field

2. **For GitLab:**
   - Configure a secret token in your GitLab webhook settings
   - Update the `gitlab.secret` field in Dokploy to match

3. **For Gitea:**
   - Configure a webhook secret in your Gitea webhook settings
   - Use the same value as your Gitea OAuth `clientSecret`

No code changes are required in existing deployments. The security features activate automatically when webhook secrets are configured.

## Testing

### Testing Webhook Signature Verification

```bash
# Test GitHub webhook with valid signature
curl -X POST https://your-domain/api/deploy/compose/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=<valid-signature>" \
  -H "X-GitHub-Event: push" \
  -d @github-webhook-payload.json

# Test GitLab webhook with valid token
curl -X POST https://your-domain/api/deploy/compose/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: your-secret-token" \
  -H "X-Gitlab-Event: Push Hook" \
  -d @gitlab-webhook-payload.json

# Test Gitea webhook with valid signature
curl -X POST https://your-domain/api/deploy/compose/YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -H "X-Gitea-Signature: <valid-signature>" \
  -H "X-Gitea-Event: push" \
  -d @gitea-webhook-payload.json
```

### Testing Rate Limiting

```bash
# Send 31 requests rapidly to trigger rate limiting
for i in {1..31}; do
  curl -X POST https://your-domain/api/deploy/compose/YOUR_TOKEN \
    -H "Content-Type: application/json" \
    -H "X-GitHub-Event: push" \
    -d '{"ref":"refs/heads/main"}'
  sleep 0.1
done
# The 31st request should return HTTP 429
```

## Troubleshooting

### "Unauthorized: Invalid webhook signature" error

- **Cause:** The webhook signature doesn't match the expected value
- **Solutions:**
  1. Verify the webhook secret is correctly configured in both the provider and Dokploy
  2. Ensure the provider is sending the correct signature header
  3. Check that the payload hasn't been modified in transit

### "Rate limit exceeded" error

- **Cause:** Too many requests from the same IP/token combination
- **Solutions:**
  1. Wait 1 minute for the rate limit window to reset
  2. Check for excessive webhook triggers (e.g., CI/CD loop)
  3. Verify webhooks are not being replayed or duplicated

### Webhook still works without signature

- **Expected behavior:** Signature verification is only enforced when a webhook secret is configured
- **To enforce:** Configure a webhook secret in your provider settings
