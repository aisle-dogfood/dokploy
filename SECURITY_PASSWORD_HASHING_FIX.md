# Security Fix: Bcrypt Hashing for HTTP Basic Auth Passwords

## Summary

This patch addresses a critical security vulnerability where HTTP Basic Auth credentials (security.password) were stored as plaintext in the database, despite Traefik middleware using bcrypt at generation time. This fix ensures passwords are:

1. **Hashed before storage** - All passwords are bcrypt hashed (10 rounds) before being written to the database
2. **Never exposed** - Passwords are masked when returned through API endpoints
3. **Properly secured in UI** - UI components show masked values and don't expose passwords

## Files Modified

### Backend Services

#### `packages/server/src/services/security.ts`
- **Added**: bcrypt import for password hashing
- **Modified `createSecurity`**: Hash password before database insertion
- **Modified `updateSecurityById`**: 
  - Hash password if being updated
  - Properly update Traefik middleware with new hashed credentials
  - Remove old middleware and create new one to ensure consistency

#### `packages/server/src/utils/traefik/security.ts`
- **Removed**: bcrypt import (no longer needed)
- **Modified `createSecurityMiddleware`**: 
  - Use stored bcrypt hash directly instead of re-hashing
  - Password is already hashed in database, just format it for Traefik

### API Routes

#### `apps/dokploy/server/api/routers/security.ts`
- **Modified `one` query**: Return empty string for password field to prevent exposure

#### `apps/dokploy/server/api/routers/application.ts`
- **Modified `one` query**: Mask passwords in security records when returning application data

### Database Schema

#### `packages/server/src/db/schema/security.ts`
- **Added**: Documentation comments explaining password field stores bcrypt hashes
- **No schema changes**: Field remains TEXT type (compatible with bcrypt hashes)

### UI Components

#### `apps/dokploy/components/dashboard/application/advanced/security/show-security.tsx`
- **Removed**: ToggleVisibilityInput import (no longer needed)
- **Modified**: Display masked password value (••••••••) instead of actual password
- **Changed**: Use regular Input component with disabled state

#### `apps/dokploy/components/dashboard/application/advanced/security/handle-security.tsx`
- **Modified**: Password field never pre-filled from server (always empty)
- **Added**: Clear label indicating "Enter new password" when editing
- **Updated**: Placeholder text to guide users appropriately

### Migration Support

#### `packages/server/scripts/hash-existing-passwords.ts` (NEW)
- Data migration script to hash existing plaintext passwords
- Safely handles already-hashed passwords (detects bcrypt prefix)
- Provides progress logging and statistics
- Can be run idempotently (safe to run multiple times)

#### `packages/server/scripts/MIGRATION_GUIDE.md` (NEW)
- Complete migration guide for existing installations
- Includes backup instructions
- Step-by-step deployment process
- Rollback procedures (for emergencies)
- Security best practices

## Security Improvements

### Before
```typescript
// Password stored as plaintext
password: "mySecretPassword123"

// Returned to client as-is
{ password: "mySecretPassword123" }

// Visible in UI
<Input value="mySecretPassword123" />
```

### After
```typescript
// Password hashed before storage
password: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

// Masked in API responses
{ password: "" }

// Masked in UI
<Input value="••••••••" disabled />
```

## Migration Path

### For New Installations
No action needed - passwords automatically hashed on creation.

### For Existing Installations
1. Deploy the updated code
2. Run: `node --require esbuild-register packages/server/scripts/hash-existing-passwords.ts`
3. Verify all passwords are hashed (start with $2a$, $2b$, or $2y$)

## Security Best Practices Enforced

1. **Defense in Depth**: Multiple layers of protection
   - Database: Bcrypt hashed passwords
   - API: Password masking in responses
   - UI: Masked display values
   
2. **Principle of Least Privilege**: Passwords never leave the server in readable form

3. **Industry Standard Hashing**: Bcrypt with 10 rounds provides robust protection

4. **No Degradation**: Traefik middleware continues to work with stored hashes

## Testing Considerations

- Existing basic auth credentials will continue working after migration
- New passwords are automatically hashed
- Password updates require entering new password (can't prefill for security)
- UI properly displays masked values
- API endpoints return empty strings for passwords

## Breaking Changes

### Minor Breaking Change: Password Updates
- **Before**: Edit form pre-filled password from server
- **After**: Edit form requires entering new password

**Rationale**: This is a necessary security improvement. Pre-filling passwords would require returning them from the API, defeating the purpose of the security fix.

### Mitigation
- Clear UI labeling: "Enter new password"
- Helpful placeholder text
- Only affects password updates (username can still be pre-filled)

## Backward Compatibility

- **Database schema**: No changes required (TEXT field accommodates bcrypt hashes)
- **Traefik integration**: Fully compatible (uses stored hashes directly)
- **Existing credentials**: Continue working after migration script runs
- **API contracts**: Password field type unchanged (string), just masked

## Compliance Benefits

This fix helps meet various security compliance requirements:
- **PCI DSS**: Requirement 8.2.1 (render unreadable authentication data)
- **OWASP Top 10**: A02:2021 – Cryptographic Failures
- **GDPR**: Article 32 (security of processing)
- **SOC 2**: CC6.1 (logical and physical access controls)

## Performance Impact

- **Minimal overhead**: Bcrypt hashing adds ~100ms per password operation
- **No runtime impact**: Hash stored in database, used directly by Traefik
- **One-time migration**: Hashing existing passwords is one-time operation

## Future Enhancements

Potential follow-up improvements:
- Password complexity requirements
- Password rotation policies  
- Audit logging for security record access
- Multi-factor authentication option
- Secret management integration (Vault, AWS Secrets Manager)
