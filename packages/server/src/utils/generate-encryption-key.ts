#!/usr/bin/env node

/**
 * Generate a secure encryption key for protecting sensitive data
 * 
 * Usage:
 *   npm run generate-encryption-key
 * 
 * Output: A 64-character hexadecimal string (32 bytes / 256 bits)
 */

import { generateEncryptionKey } from "./encryption";

function main() {
	console.log("\n=== Dokploy Encryption Key Generator ===\n");
	
	const key = generateEncryptionKey();
	
	console.log("Generated encryption key:");
	console.log(key);
	console.log("\nAdd this to your .env file:");
	console.log(`ENCRYPTION_KEY=${key}`);
	console.log("\n⚠️  IMPORTANT SECURITY NOTES:");
	console.log("  1. Store this key securely (e.g., in a secrets manager)");
	console.log("  2. Never commit this key to version control");
	console.log("  3. Back up this key in a secure location");
	console.log("  4. Losing this key means losing access to all encrypted data");
	console.log("  5. Use different keys for development, staging, and production\n");
}

main();
