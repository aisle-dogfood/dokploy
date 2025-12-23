# Security Enhancement Migration Guide

## Overview

This guide helps you migrate to the enhanced security implementation for the Schedules API.

## Breaking Changes

**None** - This update is fully backward compatible. Existing clients will continue to work without any changes.

## What's New

The following security features are now automatically enabled:

1. **Rate Limiting** - Prevents API abuse
2. **Audit Logging** - Tracks all authentication attempts
3. **Exponential Backoff** - Protects against brute-force attacks
4. **IP Allow-Listing** (Optional) - Restricts access to specific IPs

## Deployment Steps

### Step 1: Update Code

The security enhancements are already implemented in:
- `src/security.ts` (new file)
- `src/index.ts` (updated)

### Step 2: Review Configuration (Optional)

Check your environment variables in `.env`:

```bash
# Required (existing)
API_KEY=your-api-key-here

# Optional (new)
# IP_ALLOW_LIST=192.168.1.1,10.0.0.1
```

### Step 3: Deploy

Deploy the updated code using your standard deployment process:

```bash
# Build
pnpm build

# Start
pnpm start
```

### Step 4: Verify

Test that the service is working correctly:

```bash
# Health check (no auth required)
curl http://localhost:4001/health

# Authenticated request
curl -H "X-API-Key: your-api-key" \
  http://localhost:4001/create-backup

# Should see rate limit headers in response:
# X-RateLimit-Limit: 200
# X-RateLimit-Remaining: 199
# X-RateLimit-Reset: 1234567890
```

## What Happens After Deployment

### For Valid Clients

- API continues to work normally
- Rate limit headers are added to responses
- Authentication attempts are logged (success)
- No impact on performance or functionality

### For Invalid/Malicious Requests

- After 5 failed authentication attempts from same IP:
  - Exponential backoff is applied (1s, 2s, 4s, 8s, ...)
  - Returns 429 status with retry-after information
  
- Rate limiting prevents abuse:
  - 100 requests/minute per IP
  - 200 requests/minute per valid API key
  - Returns 429 when exceeded

- All attempts are logged for security monitoring

## Monitoring

### Log Messages to Watch

**Successful Authentication:**
```json
{
  "event": "api_key_validation",
  "authenticated": true,
  "ip": "192.168.1.1",
  "method": "POST",
  "path": "/create-backup"
}
```

**Failed Authentication:**
```json
{
  "event": "api_key_validation",
  "authenticated": false,
  "ip": "192.168.1.100",
  "reason": "Invalid API key"
}
```

**Rate Limit Exceeded:**
```json
{
  "level": "warn",
  "msg": "IP rate limit exceeded",
  "ip": "192.168.1.100"
}
```

**Backoff Applied:**
```json
{
  "level": "warn",
  "msg": "Rate limiting IP due to repeated failed authentication attempts",
  "ip": "192.168.1.100",
  "attempts": 5,
  "backoffMs": 1000
}
```

## Rollback Plan

If you need to rollback:

1. Revert `src/index.ts` to use the old authentication middleware
2. Remove or ignore `src/security.ts`
3. Redeploy

The old middleware code was:
```typescript
app.use(async (c, next) => {
  if (c.req.path === "/health") {
    return next();
  }
  const authHeader = c.req.header("X-API-Key");
  if (process.env.API_KEY !== authHeader) {
    return c.json({ message: "Invalid API Key" }, 403);
  }
  return next();
});
```

## Performance Impact

- **Minimal** - All rate limiting is done in-memory with O(1) operations
- Memory cleanup runs once per minute to prevent leaks
- No external dependencies or database calls
- Suitable for production use

## Scaling Considerations

For multi-instance deployments:

- Current implementation uses in-memory storage
- Rate limits are per-instance, not global
- Consider Redis-backed rate limiting for shared state
- See `SECURITY.md` for production recommendations

## Support

For questions or issues:
1. Check `SECURITY.md` for feature documentation
2. Review logs for specific error messages
3. Verify environment variables are correctly set

## Checklist

- [ ] Code deployed successfully
- [ ] Environment variables reviewed
- [ ] Health endpoint accessible
- [ ] Authenticated requests working
- [ ] Rate limit headers present in responses
- [ ] Logs showing authentication events
- [ ] (Optional) IP allow-list configured and tested
