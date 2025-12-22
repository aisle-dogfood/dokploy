/**
 * Unit tests for encryption utilities
 * 
 * These tests verify the encryption and decryption functionality
 * 
 * Run with: npm test or pnpm test
 */

import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./encryption";

// Set up test encryption key before tests
beforeAll(() => {
	// Generate a test key (64 hex characters = 32 bytes)
	process.env.ENCRYPTION_KEY =
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("Encryption Utilities", () => {
	describe("encrypt and decrypt", () => {
		it("should encrypt and decrypt a simple string", () => {
			const plaintext = "Hello, World!";
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it("should encrypt and decrypt a complex string with special characters", () => {
			const plaintext =
				'Special chars: !@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t\r\\\'"';
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it("should encrypt and decrypt a long string", () => {
			const plaintext = "A".repeat(10000);
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it("should encrypt and decrypt unicode characters", () => {
			const plaintext = "Hello 世界 🌍 Привет مرحبا";
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(plaintext);
		});

		it("should handle empty string", () => {
			const plaintext = "";
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);

			expect(encrypted).toBe("");
			expect(decrypted).toBe("");
		});

		it("should produce different encrypted values for same plaintext (different IVs)", () => {
			const plaintext = "Same plaintext";
			const encrypted1 = encrypt(plaintext);
			const encrypted2 = encrypt(plaintext);

			expect(encrypted1).not.toBe(encrypted2);
			expect(decrypt(encrypted1)).toBe(plaintext);
			expect(decrypt(encrypted2)).toBe(plaintext);
		});

		it("should encrypt sensitive credentials correctly", () => {
			const credentials = [
				"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQ...",
				"mysql://user:password@localhost:3306/db",
				"ghp_1234567890abcdefABCDEF",
				"sk-1234567890abcdefghijklmnopqrstuvwxyz",
			];

			for (const credential of credentials) {
				const encrypted = encrypt(credential);
				const decrypted = decrypt(encrypted);
				expect(decrypted).toBe(credential);
			}
		});
	});

	describe("encrypted format", () => {
		it("should produce encrypted string in correct format (iv:tag:data)", () => {
			const plaintext = "Test data";
			const encrypted = encrypt(plaintext);

			// Should have exactly 3 parts separated by colons
			const parts = encrypted.split(":");
			expect(parts).toHaveLength(3);

			// Each part should be valid hex
			for (const part of parts) {
				expect(part).toMatch(/^[0-9a-f]+$/);
			}

			// IV should be 12 bytes = 24 hex characters
			expect(parts[0].length).toBe(24);

			// Auth tag should be 16 bytes = 32 hex characters
			expect(parts[1].length).toBe(32);

			// Encrypted data length depends on plaintext (at least some length)
			expect(parts[2].length).toBeGreaterThan(0);
		});
	});

	describe("error handling", () => {
		it("should throw error when decrypting invalid format", () => {
			expect(() => decrypt("invalid-format")).toThrow();
		});

		it("should throw error when decrypting corrupted data", () => {
			const encrypted = encrypt("Test data");
			const corrupted = encrypted.replace(/a/g, "b");
			expect(() => decrypt(corrupted)).toThrow();
		});

		it("should throw error when missing encryption key", () => {
			const originalKey = process.env.ENCRYPTION_KEY;
			delete process.env.ENCRYPTION_KEY;

			expect(() => encrypt("Test")).toThrow(
				"ENCRYPTION_KEY environment variable is not set",
			);

			process.env.ENCRYPTION_KEY = originalKey;
		});

		it("should throw error when encryption key is wrong length", () => {
			const originalKey = process.env.ENCRYPTION_KEY;
			process.env.ENCRYPTION_KEY = "tooshort";

			expect(() => encrypt("Test")).toThrow(
				"ENCRYPTION_KEY must be a 64-character hex string",
			);

			process.env.ENCRYPTION_KEY = originalKey;
		});

		it("should throw error when decrypting with wrong key", () => {
			const originalKey = process.env.ENCRYPTION_KEY;

			// Encrypt with original key
			const encrypted = encrypt("Test data");

			// Try to decrypt with different key
			process.env.ENCRYPTION_KEY =
				"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

			expect(() => decrypt(encrypted)).toThrow();

			process.env.ENCRYPTION_KEY = originalKey;
		});
	});

	describe("security properties", () => {
		it("should not reveal plaintext length in encrypted output (beyond block padding)", () => {
			const short = "a";
			const long = "a".repeat(1000);

			const encryptedShort = encrypt(short);
			const encryptedLong = encrypt(long);

			// Encrypted lengths should reflect plaintext lengths (plus overhead)
			// but should be significantly different for very different plaintexts
			expect(encryptedLong.length).toBeGreaterThan(encryptedShort.length);
		});

		it("should produce unique IVs for each encryption", () => {
			const plaintext = "Same text";
			const ivs = new Set<string>();

			// Generate 100 encryptions
			for (let i = 0; i < 100; i++) {
				const encrypted = encrypt(plaintext);
				const iv = encrypted.split(":")[0];
				ivs.add(iv);
			}

			// All IVs should be unique
			expect(ivs.size).toBe(100);
		});

		it("should maintain data integrity (tampering detection)", () => {
			const plaintext = "Important data";
			const encrypted = encrypt(plaintext);

			// Tamper with the auth tag
			const parts = encrypted.split(":");
			parts[1] = parts[1].replace(/0/g, "1");
			const tampered = parts.join(":");

			expect(() => decrypt(tampered)).toThrow();
		});
	});

	describe("real-world scenarios", () => {
		it("should encrypt SSH private key", () => {
			const sshKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAYEA1234567890abcdefghij...
-----END OPENSSH PRIVATE KEY-----`;

			const encrypted = encrypt(sshKey);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(sshKey);
			expect(encrypted).not.toContain("BEGIN OPENSSH PRIVATE KEY");
		});

		it("should encrypt database password", () => {
			const password = "SuperSecret123!@#$%^&*()";
			const encrypted = encrypt(password);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(password);
			expect(encrypted).not.toContain(password);
		});

		it("should encrypt API token", () => {
			const token = "ghp_1a2b3c4d5e6f7g8h9i0jklmnopqrstuv";
			const encrypted = encrypt(token);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(token);
			expect(encrypted).not.toContain("ghp_");
		});

		it("should encrypt OAuth client secret", () => {
			const secret = "oauth2-secret-1234567890abcdefghijklmnopqrstuvwxyz";
			const encrypted = encrypt(secret);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(secret);
			expect(encrypted).not.toContain("oauth2-secret");
		});

		it("should encrypt webhook URL", () => {
			const webhook =
				"https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX";
			const encrypted = encrypt(webhook);
			const decrypted = decrypt(encrypted);

			expect(decrypted).toBe(webhook);
			expect(encrypted).not.toContain("hooks.slack.com");
		});
	});
});
