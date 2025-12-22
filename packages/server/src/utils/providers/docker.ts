import { createWriteStream } from "node:fs";
import { type ApplicationNested, mechanizeDockerContainer } from "../builders";
import { pullImage } from "../docker/utils";

interface RegistryAuth {
	username: string;
	password: string;
	registryUrl: string;
}

/**
 * Escapes a string for safe use in a bash shell command.
 * Wraps the string in single quotes and escapes any single quotes within.
 * @param str - The string to escape
 * @returns The escaped string safe for shell execution
 */
const escapeShellArg = (str: string): string => {
	if (typeof str !== "string") {
		return "''";
	}
	// Replace single quotes with '\'' (close quote, escaped quote, open quote)
	// and wrap the entire string in single quotes
	return `'${str.replace(/'/g, "'\\''")}'`;
};

/**
 * Validates that a string contains only safe characters for Docker image names.
 * Docker image format: [registry/][namespace/]repository[:tag|@digest]
 * @param dockerImage - The Docker image string to validate
 * @throws Error if the image name contains invalid characters
 */
const validateDockerImage = (dockerImage: string): void => {
	// Docker image name pattern: allows alphanumeric, dots, dashes, underscores, slashes, colons, @
	// More restrictive than Docker spec to prevent injection
	const validPattern = /^[a-zA-Z0-9._\-/:@]+$/;
	if (!validPattern.test(dockerImage)) {
		throw new Error(
			"Invalid Docker image name: contains potentially unsafe characters",
		);
	}
};

/**
 * Validates that a string contains only safe characters for registry URLs.
 * @param registryUrl - The registry URL to validate
 * @throws Error if the URL contains invalid characters
 */
const validateRegistryUrl = (registryUrl: string): void => {
	// Allow URLs with protocol, domain, port, and path
	// More restrictive pattern to prevent injection
	const validPattern = /^[a-zA-Z0-9._\-/:]+$/;
	if (!validPattern.test(registryUrl)) {
		throw new Error(
			"Invalid registry URL: contains potentially unsafe characters",
		);
	}
};

/**
 * Validates that a string contains only safe characters for usernames.
 * @param username - The username to validate
 * @throws Error if the username contains invalid characters
 */
const validateUsername = (username: string): void => {
	// Alphanumeric, dots, dashes, underscores, @ symbol
	const validPattern = /^[a-zA-Z0-9._\-@]+$/;
	if (!validPattern.test(username)) {
		throw new Error(
			"Invalid username: contains potentially unsafe characters",
		);
	}
};

export const buildDocker = async (
	application: ApplicationNested,
	logPath: string,
): Promise<void> => {
	const { buildType, dockerImage, username, password } = application;
	const authConfig: Partial<RegistryAuth> = {
		username: username || "",
		password: password || "",
		registryUrl: application.registryUrl || "",
	};

	const writeStream = createWriteStream(logPath, { flags: "a" });

	writeStream.write(`\nBuild ${buildType}\n`);

	writeStream.write(`Pulling ${dockerImage}: ✅\n`);

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		await pullImage(
			dockerImage,
			(data) => {
				if (writeStream.writable) {
					writeStream.write(`${data}\n`);
				}
			},
			authConfig,
		);
		await mechanizeDockerContainer(application);
		writeStream.write("\nDocker Deployed: ✅\n");
	} catch (error) {
		writeStream.write("❌ Error");
		throw error;
	} finally {
		writeStream.end();
	}
};

export const buildRemoteDocker = async (
	application: ApplicationNested,
	logPath: string,
) => {
	const { registryUrl, dockerImage, username, password } = application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		// Validate all inputs to prevent injection attacks
		validateDockerImage(dockerImage);
		
		// Escape all inputs for safe shell usage
		const escapedDockerImage = escapeShellArg(dockerImage);
		const escapedLogPath = escapeShellArg(logPath);

		let command = `
echo "Pulling ${dockerImage}" >> ${escapedLogPath};		
		`;

		if (username && password) {
			// Validate username and registryUrl if provided
			validateUsername(username);
			if (registryUrl) {
				validateRegistryUrl(registryUrl);
			}

			// Escape credentials for safe shell usage
			const escapedUsername = escapeShellArg(username);
			const escapedPassword = escapeShellArg(password);
			const escapedRegistryUrl = registryUrl ? escapeShellArg(registryUrl) : "''";

			// Use printf instead of echo to avoid interpretation of escape sequences
			// Pipe password securely to docker login
			command += `
if ! printf %s ${escapedPassword} | docker login --username ${escapedUsername} --password-stdin ${escapedRegistryUrl} >> ${escapedLogPath} 2>&1; then
	echo "❌ Login failed" >> ${escapedLogPath};
	exit 1;
fi
`;
		}

		command += `
docker pull ${escapedDockerImage} >> ${escapedLogPath} 2>> ${escapedLogPath} || { 
  echo "❌ Pulling image failed" >> ${escapedLogPath};
  exit 1;
}

echo "✅ Pulling image completed." >> ${escapedLogPath};
`;
		return command;
	} catch (error) {
		throw error;
	}
};
