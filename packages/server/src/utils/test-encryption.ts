import { decrypt, encrypt } from "./encryption";

/**
 * Simple test script to verify encryption setup
 */
export function testEncryption() {
	console.log("Testing encryption setup...\n");

	// Check if encryption key is set
	if (!process.env.ENCRYPTION_KEY) {
		console.error("❌ ENCRYPTION_KEY is not set!");
		console.log(
			"Please set ENCRYPTION_KEY environment variable with a strong random key.",
		);
		console.log("Generate one with: openssl rand -hex 32");
		return false;
	}

	console.log("✓ ENCRYPTION_KEY is set");

	// Test encryption/decryption
	const testData = [
		"password123",
		"my-super-secret-api-key",
		"sk-proj-abcdef1234567890",
		"ghp_1234567890abcdefghijklmnopqrstuv",
		"xoxb-1234567890-1234567890-abcdefghijklmnop",
	];

	console.log("\nTesting encryption/decryption:");

	for (const plaintext of testData) {
		try {
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);

			if (decrypted === plaintext) {
				console.log(`✓ "${plaintext.substring(0, 15)}..." encrypted successfully`);

				// Check format
				const parts = encrypted.split(":");
				if (parts.length !== 3) {
					console.error(
						`  ❌ Invalid encrypted format (expected 3 parts, got ${parts.length})`,
					);
					return false;
				}
			} else {
				console.error(
					`  ❌ Decryption failed for "${plaintext.substring(0, 15)}..."`,
				);
				console.error(`  Expected: ${plaintext}`);
				console.error(`  Got: ${decrypted}`);
				return false;
			}
		} catch (error) {
			console.error(
				`❌ Error encrypting/decrypting "${plaintext.substring(0, 15)}...":`,
				error,
			);
			return false;
		}
	}

	// Test that plaintext is detected correctly
	console.log("\nTesting backward compatibility with plaintext:");
	const plaintextValue = "plaintext-password";
	const decryptedPlaintext = decrypt(plaintextValue);

	if (decryptedPlaintext === plaintextValue) {
		console.log("✓ Plaintext values are handled correctly");
	} else {
		console.error("❌ Plaintext detection failed");
		return false;
	}

	// Test empty values
	console.log("\nTesting edge cases:");
	if (encrypt("") === "" && decrypt("") === "") {
		console.log("✓ Empty strings handled correctly");
	} else {
		console.error("❌ Empty string handling failed");
		return false;
	}

	console.log("\n✅ All encryption tests passed!");
	console.log("\nEncryption is properly configured and working.");
	return true;
}

// Allow running this script directly
if (require.main === module) {
	const success = testEncryption();
	process.exit(success ? 0 : 1);
}
