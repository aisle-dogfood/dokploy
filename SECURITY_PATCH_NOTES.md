# Security Patch: Server Command Injection Prevention

## Overview
This patch addresses a critical security vulnerability (CVE) where the `server.command` field could be exploited for command injection and privilege escalation during SSH-based server setup flows.

## Vulnerability Details
- **Location**: `server.command` field in the database schema
- **Risk**: Command injection and privilege escalation
- **Attack Vector**: Malicious users could inject arbitrary commands that would be executed over SSH with elevated privileges during server setup

## Security Mitigations Implemented

### 1. Command Validation (`packages/server/src/utils/command-validation.ts`)
- **Strict Pattern Matching**: Rejects dangerous shell metacharacters and command patterns
- **Length Limits**: Enforces maximum command length to prevent DoS
- **Pattern Blacklist**: Blocks known dangerous patterns including:
  - Destructive commands (`rm -rf`, `dd`)
  - Command substitution with network tools (`wget`, `curl`)
  - Command chaining abuse
  - Shell injection patterns

### 2. Role-Based Access Control (`apps/dokploy/server/api/routers/server.ts`)
- **Authorization Check**: Only organization owners and admins can modify server setup commands
- **Permission Enforcement**: Regular members are explicitly denied access to command modification
- **Organization Validation**: Verifies user belongs to the organization and has appropriate role

### 3. Input Validation (`packages/server/src/db/schema/server.ts`)
- **Schema-Level Validation**: Zod schema validates commands before database storage
- **Automatic Rejection**: Invalid commands are rejected at the API level with descriptive error messages

### 4. Defense-in-Depth (`packages/server/src/setup/server-setup.ts`)
- **Pre-Execution Validation**: Commands are validated again before SSH execution
- **Sanitization**: Removes null bytes and dangerous characters
- **Early Termination**: Invalid commands prevent SSH execution entirely

### 5. Audit Logging
- **Security Events**: All command modifications are logged with:
  - User ID
  - Server ID
  - Organization ID
  - User role
  - Timestamp
- **Monitoring**: Enables detection of suspicious activity

## Changes Summary

### Files Modified:
1. `packages/server/src/utils/command-validation.ts` (NEW)
   - Command validation and sanitization utilities

2. `packages/server/src/db/schema/server.ts`
   - Added validation to `apiUpdateServer` schema
   - Imported validation function

3. `apps/dokploy/server/api/routers/server.ts`
   - Added role-based authorization for command updates
   - Added audit logging
   - Imported `member` schema for role checks

4. `packages/server/src/setup/server-setup.ts`
   - Added pre-execution validation
   - Added command sanitization
   - Imported validation utilities

## Security Best Practices Applied

1. **Principle of Least Privilege**: Only owners/admins can modify critical commands
2. **Defense in Depth**: Multiple validation layers (schema, API, execution)
3. **Input Validation**: Strict validation before any processing
4. **Audit Trail**: All security-relevant actions are logged
5. **Fail Secure**: Invalid commands result in operation denial, not fallback

## Testing Recommendations

1. Verify regular members cannot modify server commands
2. Verify owners/admins can modify commands with valid patterns
3. Verify dangerous patterns are rejected
4. Verify audit logs are generated for command modifications
5. Test that default commands work correctly when no custom command is set

## Migration Notes

- **Database Schema**: No migration required (field already exists)
- **Backward Compatibility**: Existing valid commands continue to work
- **Breaking Changes**: Previously accepted dangerous commands will now be rejected
- **User Impact**: Regular members will lose ability to modify server commands (security improvement)
