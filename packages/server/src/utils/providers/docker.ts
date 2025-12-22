import { createWriteStream } from "node:fs";
import { type ApplicationNested, mechanizeDockerContainer } from "../builders";
import { pullImage } from "../docker/utils";
import { escapeShellArg } from "../process/shellEscape";

interface RegistryAuth {
	username: string;
	password: string;
	registryUrl: string;
}

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

		// Escape all user-controlled inputs to prevent command injection
		const escapedDockerImage = escapeShellArg(dockerImage);
		const escapedLogPath = escapeShellArg(logPath);

		let command = `
echo "Pulling ${escapedDockerImage}" >> ${escapedLogPath};		
		`;

		if (username && password) {
			// Escape credentials and use printf instead of echo to prevent interpretation
			const escapedUsername = escapeShellArg(username);
			const escapedPassword = escapeShellArg(password);
			const escapedRegistryUrl = escapeShellArg(registryUrl || "");

			command += `
if ! printf '%s' ${escapedPassword} | docker login --username ${escapedUsername} --password-stdin ${escapedRegistryUrl} > /dev/null 2>&1; then
	echo "❌ Login failed" >> ${escapedLogPath};
	exit 1;
fi
echo "✅ Registry Login Success" >> ${escapedLogPath};
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
