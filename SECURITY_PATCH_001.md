# Security Patch: Hardened Server Defaults

## Overview
This patch addresses two critical security vulnerabilities related to insecure default values in server configuration.

## Issues Fixed

### 1. SSH Username Defaulting to 'root'
**Severity:** High  
**Issue:** The server.username field defaulted to 'root', increasing security risks if not explicitly overridden.

**Changes:**
- Removed the default value for `server.username` field in the database schema
- Added validation to reject 'root' username during server creation and updates
- Added runtime warnings when 'root' username is detected in SSH connections
- Users are now required to explicitly specify a username when creating servers

**Recommendation:**
- Use a dedicated non-root user with appropriate sudo privileges
- Configure SSH key-based authentication
- Avoid using the root user for remote server management

### 2. Empty Monitoring Token Default
**Severity:** High  
**Issue:** The metricsConfig.server.token defaulted to an empty string "", creating an unauthenticated monitoring endpoint.

**Changes:**
- Changed monitoring token default from empty string to automatically generated 32-character random token
- Added validation to reject empty or whitespace-only tokens in monitoring configuration
- Added runtime checks to prevent starting monitoring agents with empty tokens
- Tokens are now automatically generated using `nanoid(32)` for each new server

**Recommendation:**
- Existing servers with empty tokens will be automatically updated during migration
- Tokens should be rotated periodically
- Never expose monitoring tokens to clients or logs

## Migration Required

### For New Installations
No action required. All security improvements are automatically applied.

### For Existing Installations

#### 1. Update Monitoring Tokens
Run the security migration to update existing servers with empty monitoring tokens:

```typescript
import { updateMonitoringTokens, auditRootUsernameUsage } from "@dokploy/server";

// Update all servers with empty monitoring tokens
await updateMonitoringTokens();

// Audit servers for root username usage
await auditRootUsernameUsage();
```

#### 2. Review Root Username Usage
Servers using 'root' username will continue to work but will log warnings. It is strongly recommended to:
1. Create a dedicated non-root user on each remote server
2. Grant appropriate sudo privileges to the user
3. Update server configuration to use the new user
4. Test SSH connectivity
5. Remove or disable root SSH access

Example setup for a dedicated user:
```bash
# On the remote server
sudo adduser dokploy
sudo usermod -aG docker dokploy
sudo usermod -aG sudo dokploy

# Configure sudo without password (optional, use with caution)
echo "dokploy ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/dokploy

# Configure SSH key authentication
mkdir -p /home/dokploy/.ssh
cat your-public-key.pub >> /home/dokploy/.ssh/authorized_keys
chmod 700 /home/dokploy/.ssh
chmod 600 /home/dokploy/.ssh/authorized_keys
chown -R dokploy:dokploy /home/dokploy/.ssh
```

## Database Schema Changes

### Migration File: 0101_security_hardening.sql
```sql
-- Security hardening: Remove default 'root' username
ALTER TABLE "server" ALTER COLUMN "username" DROP DEFAULT;
```

## Security Best Practices

### SSH Access
1. **Never use root user** for SSH connections in production
2. Use **key-based authentication** only, disable password authentication
3. Create **dedicated service accounts** with minimal required privileges
4. Implement **sudo auditing** to track privileged operations
5. Consider using **SSH certificates** for better key management

### Monitoring Security
1. **Never use empty tokens** for monitoring endpoints
2. **Rotate tokens regularly** (recommended: every 90 days)
3. **Use HTTPS** for monitoring callbacks
4. **Restrict network access** to monitoring ports using firewalls
5. **Monitor token usage** and audit access logs

## Testing
All changes maintain backward compatibility with existing functionality while adding security controls. Existing servers will continue to work with warnings logged for insecure configurations.

## References
- CWE-798: Use of Hard-coded Credentials
- CWE-1188: Insecure Default Initialization of Resource
- OWASP: Secure Configuration Guide

## Contact
For security concerns or questions, please refer to SECURITY.md
