# Security Fix: Command Injection in S3 Connection Test

## Vulnerability Summary

**Vulnerability Name:** Command injection in S3 connection test  
**Severity:** Critical  
**Affected File:** `apps/dokploy/server/api/routers/destination.ts`

### Description
Untrusted destination fields were interpolated into a shell command string passed to `execAsync`/`execAsyncRemote` without proper quoting/escaping. This allowed potential command injection attacks through user-controlled fields including:
- accessKey
- secretAccessKey
- region
- endpoint
- provider
- bucket
- serverId

## Fix Implementation

### 1. Input Validation (Defense Layer 1)

Enhanced Zod schema validation in `packages/server/src/db/schema/destination.ts` to enforce strict input constraints:

- **provider**: Restricted to alphanumeric characters, hyphens, and underscores only. Max length: 50 chars.
- **accessKey**: Restricted to base64-safe characters (alphanumeric, +, /, =). Max length: 200 chars.
- **secretAccessKey**: Restricted to base64-safe characters. Max length: 200 chars.
- **bucket**: Restricted to S3-compatible characters (alphanumeric, dots, hyphens, underscores). Length: 1-63 chars.
- **region**: Restricted to alphanumeric characters, hyphens, and underscores. Max length: 50 chars.
- **endpoint**: Must be a valid URL with http:// or https:// protocol. Max length: 200 chars.
- **serverId**: Restricted to alphanumeric characters, hyphens, and underscores. Max length: 50 chars.

All fields now reject shell metacharacters including: `;`, `$`, `` ` ``, `|`, `&`, `\n`, `'`, `"`, `\`, `>`, `<`

### 2. Safe Command Execution (Defense Layer 2)

Replaced shell-based command execution with safer alternatives:

#### Local Execution
- Changed from: `execAsync(command)` (uses shell)
- Changed to: `execFileAsync("rclone", args)` (no shell, direct process execution)

This prevents shell interpretation of special characters entirely.

#### Remote Execution
- Implemented `shellEscape()` function to properly escape arguments
- Created `execRcloneRemote()` wrapper that escapes all arguments before passing to `execAsyncRemote()`
- Uses single-quote wrapping with proper escaping of embedded single quotes

### 3. Command Construction

Changed from string concatenation to argument array:
```javascript
// Before (vulnerable):
const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

// After (safe):
const rcloneArgs = [
  "ls",
  `--s3-access-key-id=${accessKey}`,
  // ... other flags
  rcloneDestination
];
```

## Testing

Comprehensive test suite added to verify the fix:

### 1. Input Validation Tests (`__test__/destination-security.test.ts`)
- 76 tests covering all input fields
- Tests verify that malicious inputs with shell metacharacters are rejected
- Tests verify that legitimate S3 configurations are accepted
- Covers real-world scenarios: AWS S3, MinIO, DigitalOcean Spaces

### 2. Shell Escaping Tests (`__test__/shell-escape.test.ts`)
- 17 tests covering the `shellEscape()` function
- Verifies proper escaping of dangerous characters
- Tests command injection prevention (command substitution, pipes, redirection, etc.)
- Validates handling of S3 credential-like strings

### 3. Integration Tests (`__test__/destination-integration.test.ts`)
- 22 tests covering the complete command building process
- Tests both safe parameters and injection attempts
- Verifies command construction for different S3 providers
- Validates that args array properly preserves values for `execFileAsync`

### Test Results
All 256 tests pass, including 115 new security-focused tests.

## Security Benefits

### Defense in Depth
The fix implements multiple layers of security:
1. **Input validation** - Rejects malicious input at the API boundary
2. **Safe execution** - Uses non-shell execution methods
3. **Escaping** - Properly escapes arguments when shell execution is unavoidable

### Attack Prevention
The fix prevents multiple attack vectors:
- Command injection via shell metacharacters
- Command substitution (`$(...)` and `` `...` ``)
- Command chaining (`;`, `&&`, `||`)
- Pipe injection (`|`)
- Redirection attacks (`>`, `<`)
- Newline injection
- Variable expansion

### Backwards Compatibility
The fix maintains full compatibility with legitimate use cases:
- AWS S3 configurations work correctly
- MinIO configurations work correctly
- DigitalOcean Spaces configurations work correctly
- All existing functionality is preserved

## Files Modified

1. `apps/dokploy/server/api/routers/destination.ts`
   - Added `shellEscape()` function
   - Added `execRcloneRemote()` wrapper
   - Modified `testConnection` endpoint to use safe execution methods
   - Changed from `execAsync` to `execFileAsync` for local execution

2. `packages/server/src/db/schema/destination.ts`
   - Enhanced input validation with strict regex patterns
   - Added length constraints
   - Added URL protocol validation for endpoints

3. Test Files (New):
   - `apps/dokploy/__test__/destination-security.test.ts` - Input validation tests
   - `apps/dokploy/__test__/shell-escape.test.ts` - Shell escaping tests
   - `apps/dokploy/__test__/destination-integration.test.ts` - Integration tests

## Verification

The fix has been verified through:
1. Comprehensive unit tests for input validation
2. Comprehensive unit tests for shell escaping
3. Integration tests for command building
4. All existing tests continue to pass
5. Manual review of code changes

## Conclusion

This fix effectively mitigates the command injection vulnerability through multiple defensive layers while preserving all legitimate functionality. The comprehensive test suite ensures the fix works correctly and provides protection against future regressions.
