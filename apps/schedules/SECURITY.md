# Security Configuration

This document describes the security features implemented for the Schedules API.

## Features

### 1. Rate Limiting

The API implements two levels of rate limiting:

- **Per-IP Rate Limiting**: 100 requests per minute per IP address
- **Per-API-Key Rate Limiting**: 200 requests per minute per API key

Rate limit information is included in response headers:
- `X-RateLimit-Limit`: Maximum number of requests allowed
- `X-RateLimit-Remaining`: Number of requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit resets

When rate limit is exceeded, the API returns:
```json
{
  "message": "Rate limit exceeded",
  "retryAfter": 60
}
```
Status code: `429 Too Many Requests`

### 2. IP Allow-Listing (Optional)

To restrict API access to specific IP addresses, set the `IP_ALLOW_LIST` environment variable:

```bash
IP_ALLOW_LIST="192.168.1.1,10.0.0.1,203.0.113.0"
```

- Multiple IPs can be specified as a comma-separated list
- If not set, all IPs are allowed
- Requests from non-allowed IPs receive a `403 Forbidden` response

### 3. Exponential Backoff for Failed Authentication

To prevent brute-force attacks on API keys:

- After 5 failed authentication attempts from the same IP, exponential backoff is applied
- Backoff duration increases with each subsequent failure: 1s, 2s, 4s, 8s, up to 5 minutes
- Failed attempts are cleared upon successful authentication
- Backoff periods automatically expire after 1 hour of inactivity

When in backoff period, the API returns:
```json
{
  "message": "Too many failed attempts. Please try again later.",
  "retryAfter": 30
}
```
Status code: `429 Too Many Requests`

### 4. Audit Logging

All authentication attempts are logged with the following information:
- Event type: `api_key_validation`
- Authentication result (success/failure)
- Client IP address
- HTTP method and path
- User-Agent header
- Timestamp
- Failure reason (if applicable)

Example log entry:
```json
{
  "event": "api_key_validation",
  "authenticated": true,
  "ip": "192.168.1.1",
  "method": "POST",
  "path": "/create-backup",
  "userAgent": "curl/7.68.0",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### 5. Security Headers

The API includes security-relevant headers in responses:
- Rate limit headers for transparency
- Appropriate HTTP status codes for different security scenarios

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `API_KEY` | The valid API key for authentication | Yes | - |
| `IP_ALLOW_LIST` | Comma-separated list of allowed IP addresses | No | All IPs allowed |

## Best Practices

1. **Rotate API Keys Regularly**: While not automated, consider implementing a process to rotate the `API_KEY` periodically
2. **Monitor Audit Logs**: Regularly review authentication logs for suspicious patterns
3. **Use IP Allow-Listing**: In production environments, restrict access to known IPs when possible
4. **Secure Key Storage**: Never commit API keys to version control; use environment variables or secret management systems
5. **Production Deployment**: For production deployments with multiple instances, consider using Redis for shared rate limit storage instead of in-memory storage

## Future Improvements

Consider implementing:
- Key expiration and rotation mechanisms
- Per-tenant API key scoping
- Integration with external secret management (e.g., HashiCorp Vault, AWS Secrets Manager)
- Redis-backed rate limiting for distributed deployments
- Prometheus metrics for security monitoring
- Webhook notifications for suspicious activity
