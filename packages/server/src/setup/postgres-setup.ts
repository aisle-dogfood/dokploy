import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CreateServiceOptions } from "dockerode";
import { docker, paths } from "../constants";
import { pullImage } from "../utils/docker/utils";

/**
 * Get or generate a secure Postgres password.
 * Priority:
 * 1. Use POSTGRES_PASSWORD environment variable if set (for operator-supplied secrets)
 * 2. Use existing password from file if present
 * 3. Generate a new secure password and store it
 */
const getOrCreatePostgresPassword = (): string => {
	// Check for operator-supplied password via environment variable
	if (process.env.POSTGRES_PASSWORD) {
		console.log("Using POSTGRES_PASSWORD from environment variable");
		return process.env.POSTGRES_PASSWORD;
	}

	const { BASE_PATH } = paths();
	const passwordFile = path.join(BASE_PATH, ".postgres-password");

	// Check if password file exists
	if (existsSync(passwordFile)) {
		const password = readFileSync(passwordFile, "utf-8").trim();
		if (password) {
			console.log("Using existing Postgres password from file");
			return password;
		}
	}

	// Generate new cryptographically secure password using 32 random bytes
	// Encode as base64url (URL-safe base64 without padding) for compatibility
	const newPassword = randomBytes(32)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
	
	// Ensure BASE_PATH exists
	if (!existsSync(BASE_PATH)) {
		mkdirSync(BASE_PATH, { recursive: true });
	}

	// Store password securely with restricted permissions (read/write for owner only)
	writeFileSync(passwordFile, newPassword, { mode: 0o600 });
	console.log("Generated and stored new Postgres password");
	
	return newPassword;
};

export const initializePostgres = async () => {
	const imageName = "postgres:16";
	const containerName = "dokploy-postgres";
	const postgresPassword = getOrCreatePostgresPassword();
	
	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: [
					"POSTGRES_USER=dokploy",
					"POSTGRES_DB=dokploy",
					`POSTGRES_PASSWORD=${postgresPassword}`,
				],
				Mounts: [
					{
						Type: "volume",
						Source: "dokploy-postgres-database",
						Target: "/var/lib/postgresql/data",
					},
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
		...(process.env.NODE_ENV === "development" && {
			EndpointSpec: {
				Ports: [
					{
						TargetPort: 5432,
						PublishedPort: 5432,
						Protocol: "tcp",
						PublishMode: "host",
					},
				],
			},
		}),
	};
	try {
		await pullImage(imageName);

		const service = docker.getService(containerName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
		});
		console.log("Postgres Started ✅");
	} catch (_) {
		try {
			await docker.createService(settings);
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log("Postgres service already exists, continuing...");
		}
		console.log("Postgres Not Found: Starting ✅");
	}
};
