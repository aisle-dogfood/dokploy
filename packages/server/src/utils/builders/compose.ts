import {
	createWriteStream,
	existsSync,
	mkdirSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import boxen from "boxen";
import {
	writeDomainsToCompose,
	writeDomainsToComposeRemote,
} from "../docker/domain";
import {
	encodeBase64,
	getEnviromentVariablesObject,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export type ComposeNested = InferResultType<
	"compose",
	{ project: true; mounts: true; domains: true }
>;
export const buildCompose = async (compose: ComposeNested, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { sourceType, appName, mounts, composeType, domains } = compose;
	try {
		const { COMPOSE_PATH } = paths();
		const command = createCommand(compose);
		await writeDomainsToCompose(compose, domains);
		createEnvFile(compose);

		if (compose.isolatedDeployment) {
			const escapedAppName = escapeShellArg(compose.appName);
			await execAsync(
				`docker network inspect ${escapedAppName} >/dev/null 2>&1 || docker network create ${composeType === "stack" ? "--driver overlay" : ""} --attachable ${escapedAppName}`,
			);
		}

		const logContent = `
    App Name: ${appName}
    Build Compose 🐳
    Detected: ${mounts.length} mounts 📂
    Command: docker ${command}
    Source Type: docker ${sourceType} ✅
    Compose Type: ${composeType} ✅`;
		const logBox = boxen(logContent, {
			padding: {
				left: 1,
				right: 1,
				bottom: 1,
			},
			width: 80,
			borderStyle: "double",
		});
		writeStream.write(`\n${logBox}\n`);
		const projectPath = join(COMPOSE_PATH, compose.appName, "code");

		await spawnAsync(
			"docker",
			[...command.split(" ")],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data.toString());
				}
			},
			{
				cwd: projectPath,
				env: {
					NODE_ENV: process.env.NODE_ENV,
					PATH: process.env.PATH,
					...(composeType === "stack" && {
						...getEnviromentVariablesObject(compose.env, compose.project.env),
					}),
				},
			},
		);

		if (compose.isolatedDeployment) {
			const escapedAppName = escapeShellArg(compose.appName);
			await execAsync(
				`docker network connect ${escapedAppName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1`,
			).catch(() => {});
		}

		writeStream.write("Docker Compose Deployed: ✅");
	} catch (error) {
		writeStream.write(`Error ❌ ${(error as Error).message}`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const getBuildComposeCommand = async (
	compose: ComposeNested,
	logPath: string,
) => {
	const { COMPOSE_PATH } = paths(true);
	const { sourceType, appName, mounts, composeType, domains } = compose;
	const command = createCommand(compose);
	const envCommand = getCreateEnvFileCommand(compose);
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	const exportEnvCommand = getExportEnvCommand(compose);

	const newCompose = await writeDomainsToComposeRemote(
		compose,
		domains,
		logPath,
	);
	const logContent = `
App Name: ${appName}
Build Compose 🐳
Detected: ${mounts.length} mounts 📂
Command: docker ${command}
Source Type: docker ${sourceType} ✅
Compose Type: ${composeType} ✅`;

	const logBox = boxen(logContent, {
		padding: {
			left: 1,
			right: 1,
			bottom: 1,
		},
		width: 80,
		borderStyle: "double",
	});

	// Escape shell arguments to prevent command injection
	const escapedLogPath = escapeShellArg(logPath);
	const escapedProjectPath = escapeShellArg(projectPath);
	const escapedAppName = escapeShellArg(compose.appName);
	const escapedLogBox = escapeShellArg(logBox);

	const bashCommand = `
	set -e
	{
		echo ${escapedLogBox} >> ${escapedLogPath}
	
		${newCompose}
	
		${envCommand}
	
		cd ${escapedProjectPath};

        ${exportEnvCommand}
		${compose.isolatedDeployment ? `docker network inspect ${escapedAppName} >/dev/null 2>&1 || docker network create --attachable ${escapedAppName}` : ""}
		docker ${command.split(" ").join(" ")} >> ${escapedLogPath} 2>&1 || { echo "Error: ❌ Docker command failed" >> ${escapedLogPath}; exit 1; }
		${compose.isolatedDeployment ? `docker network connect ${escapedAppName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1` : ""}
	
		echo "Docker Compose Deployed: ✅" >> ${escapedLogPath}
	} || {
		echo "Error: ❌ Script execution failed" >> ${escapedLogPath}
		exit 1
	}
	`;

	return await execAsyncRemote(compose.serverId, bashCommand);
};

const sanitizeCommand = (command: string) => {
	const sanitizedCommand = command.trim();

	const parts = sanitizedCommand.split(/\s+/);

	const restCommand = parts.map((arg) => arg.replace(/^"(.*)"$/, "$1"));

	return restCommand.join(" ");
};

const escapeShellArg = (arg: string): string => {
	// Escape shell argument by wrapping in single quotes and escaping any single quotes
	// This prevents command injection by treating the entire string as a literal value
	return `'${arg.replace(/'/g, "'\\''")}'`;
};

export const createCommand = (compose: ComposeNested) => {
	const { composeType, appName, sourceType } = compose;
	if (compose.command) {
		return `${sanitizeCommand(compose.command)}`;
	}

	const path =
		sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
	let command = "";

	if (composeType === "docker-compose") {
		command = `compose -p ${appName} -f ${path} up -d --build --remove-orphans`;
	} else if (composeType === "stack") {
		command = `stack deploy -c ${path} ${appName} --prune`;
	}

	return command;
};

const createEnvFile = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths();
	const { env, composePath, appName } = compose;
	const composeFilePath =
		join(COMPOSE_PATH, appName, "code", composePath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.yml");

	const envFilePath = join(dirname(composeFilePath), ".env");
	let envContent = `APP_NAME=${appName}\n`;
	envContent += env || "";
	if (!envContent.includes("DOCKER_CONFIG")) {
		envContent += "\nDOCKER_CONFIG=/root/.docker";
	}

	if (compose.randomize) {
		envContent += `\nCOMPOSE_PREFIX=${compose.suffix}`;
	}

	const envFileContent = prepareEnvironmentVariables(
		envContent,
		compose.project.env,
	).join("\n");

	if (!existsSync(dirname(envFilePath))) {
		mkdirSync(dirname(envFilePath), { recursive: true });
	}
	writeFileSync(envFilePath, envFileContent);
};

export const getCreateEnvFileCommand = (compose: ComposeNested) => {
	const { COMPOSE_PATH } = paths(true);
	const { env, composePath, appName } = compose;
	const composeFilePath =
		join(COMPOSE_PATH, appName, "code", composePath) ||
		join(COMPOSE_PATH, appName, "code", "docker-compose.yml");

	const envFilePath = join(dirname(composeFilePath), ".env");

	let envContent = `APP_NAME=${appName}\n`;
	envContent += env || "";
	if (!envContent.includes("DOCKER_CONFIG")) {
		envContent += "\nDOCKER_CONFIG=/root/.docker";
	}

	if (compose.randomize) {
		envContent += `\nCOMPOSE_PREFIX=${compose.suffix}`;
	}

	const envFileContent = prepareEnvironmentVariables(
		envContent,
		compose.project.env,
	).join("\n");

	const encodedContent = encodeBase64(envFileContent);
	const escapedEnvFilePath = escapeShellArg(envFilePath);
	return `
touch ${escapedEnvFilePath};
echo "${encodedContent}" | base64 -d > ${escapedEnvFilePath};
	`;
};

const getExportEnvCommand = (compose: ComposeNested) => {
	if (compose.composeType !== "stack") return "";

	const envVars = getEnviromentVariablesObject(
		compose.env,
		compose.project.env,
	);
	const exports = Object.entries(envVars)
		.map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
		.join("\n");

	return exports ? `\n# Export environment variables\n${exports}\n` : "";
};
