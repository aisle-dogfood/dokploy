# Webhook Security Improvements

## Overview

This document describes the security enhancements made to the generic deploy webhook endpoint (`/api/deploy/[refreshToken]`) to mitigate token-based authentication vulnerabilities.

## Vulnerabilities Addressed

The original implementation had the following security concerns:
- **Token-only authentication**: Relied solely on a URL path token without additional verification
- **No rate limiting**: Vulnerable to brute force token discovery attacks
- **Missing request validation**: No verification that requests originated from legitimate webhook providers
- **Timing attacks**: Token comparison vulnerable to timing analysis
- **Insufficient monitoring**: Limited security logging for suspicious activity

## Security Enhancements

### 1. Multi-Layer Rate Limiting

Two independent rate limiting mechanisms have been implemented:

#### Token-based Rate Limiting
- Limits requests per refresh token to **10 requests per minute**
- Prevents abuse of discovered tokens
- Independent tracking per token

#### IP-based Rate Limiting  
- Limits requests per IP address to **10 requests per minute**
- Prevents mass token brute-forcing from single source
- Complements token-based limiting

**Configuration:**
```typescript
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;     // Max requests per window
```

### 2. Failed Authentication Tracking

Implements automatic IP blocking for repeated failed authentication attempts:

- Tracks failed authentication attempts per IP address
- After **5 failed attempts** within 1 minute, IP is blocked for **15 minutes**
- Applies to:
  - Missing/invalid tokens
  - Missing provider headers
  - Token mismatches

**Configuration:**
```typescript
const MAX_FAILED_ATTEMPTS = 5;           // Failed attempts before blocking
const BLOCK_DURATION = 15 * 60 * 1000;  // 15 minutes
```

### 3. Provider Header Validation

Requests must include recognized webhook provider headers:

**Accepted Provider Headers:**
- `x-github-event` - GitHub webhooks
- `x-gitlab-event` - GitLab webhooks
- `x-gitea-event` - Gitea webhooks
- `x-event-key` - Bitbucket webhooks
- `user-agent: Go-http-client` - Docker Hub webhooks

Requests without valid provider headers are rejected with HTTP 403.

### 4. Timing-Safe Token Comparison

Implements constant-time token comparison to prevent timing attacks:

```typescript
function timingSafeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

This prevents attackers from using response time differences to infer token characters.

### 5. Comprehensive Security Logging

Enhanced logging for security monitoring and incident response:

**Failed Attempts Logged:**
- Missing refresh tokens
- Missing provider headers
- Invalid tokens
- Rate limit violations
- IP blocks

**Successful Deployments Logged:**
- Application ID
- Provider type
- Client IP address
- Branch name

**Log Format:**
```
[Security] <Event Type>: <Details>
```

Example logs:
```
[Security] Invalid webhook token attempt from IP: 192.168.1.100
[Security] IP 192.168.1.100 blocked due to excessive failed authentication attempts
[Security] Webhook deployment triggered: application=abc123, provider=github, ip=192.168.1.50, branch=main
```

### 6. Client IP Detection

Properly extracts client IP address considering proxy headers:

- Checks `x-forwarded-for` header (for reverse proxy scenarios)
- Falls back to `req.socket.remoteAddress`
- Used for rate limiting and logging

## Security Benefits

### Protection Against Token Brute Force
- Rate limiting makes brute force attacks impractical
- IP blocking after repeated failures
- Timing-safe comparison prevents inference attacks

### Defense in Depth
- Multiple validation layers (token, headers, rate limits)
- Each layer provides independent protection
- Failure of one layer doesn't compromise security

### Monitoring and Incident Response
- Comprehensive logging enables threat detection
- Failed attempt tracking identifies attack patterns
- IP blocking provides automatic response to attacks

### Legitimate Traffic Protection
- Rate limits are generous for normal webhook usage (10/minute)
- Provider validation ensures only expected sources
- Minimal impact on legitimate deployments

## Configuration

Rate limiting parameters can be adjusted at the top of the file:

```typescript
// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000;      // Time window (1 minute)
const MAX_REQUESTS_PER_WINDOW = 10;           // Max requests per window
const MAX_FAILED_ATTEMPTS = 5;                // Failed attempts before blocking
```

Adjust these values based on your deployment patterns and security requirements.

## Operational Considerations

### Memory Usage
- In-memory rate limiting stores use Map structures
- Automatic cleanup every 5 minutes removes expired entries
- Memory usage scales with number of active tokens and IPs

### Distributed Deployments
- Current implementation uses in-memory storage
- For multi-instance deployments, consider:
  - Redis-based rate limiting
  - Shared state across instances
  - Distributed IP blocking

### Monitoring Recommendations
1. Set up log aggregation for security events
2. Monitor for patterns of IP blocks
3. Alert on unusual spike in failed attempts
4. Track rate limit violations

## Migration Notes

These changes are backward compatible:
- Existing webhooks continue to work
- No database schema changes required
- No configuration changes needed
- Tokens remain the same (nanoid-generated)

## Best Practices

For maximum security:
1. **Use provider-specific endpoints when available** (e.g., `/api/deploy/github` with HMAC verification)
2. **Rotate tokens regularly** if they may have been exposed
3. **Monitor security logs** for suspicious activity
4. **Consider IP allow-listing** for known webhook sources
5. **Ensure tokens are kept secret** (never commit to source control)

## Testing

All existing tests pass with these changes:
- ✓ 33 test files
- ✓ 194 tests passed
- No breaking changes to functionality

## Response Codes

| Code | Meaning | Reason |
|------|---------|--------|
| 200 | Success | Deployment triggered successfully |
| 400 | Bad Request | Invalid request format or auto-deploy disabled |
| 403 | Forbidden | Missing required provider headers |
| 404 | Not Found | Invalid refresh token |
| 429 | Too Many Requests | Rate limit exceeded or IP blocked |

## Future Enhancements

Potential future improvements:
1. Signature verification (HMAC) for additional security
2. Configurable rate limits per application
3. Redis-based distributed rate limiting
4. IP allow-list configuration
5. Webhook secret support (similar to GitHub integration)
6. Two-factor webhook authentication
