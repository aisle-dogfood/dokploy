import type { WriteStream } from "node:fs";
import type { ApplicationNested } from "../builders";
import { spawnAsync } from "../process/spawnAsync";
import { escapeShellArg } from "../process/shellEscape";

export const uploadImage = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const registry = application.registry;

	if (!registry) {
		throw new Error("Registry not found");
	}

	const { registryUrl, imagePrefix, username } = registry;
	const { appName } = application;
	const imageName = `${appName}:latest`;

	const finalURL = registryUrl;

	// Build registry tag in correct format: registry.com/owner/image:tag
	// For ghcr.io: ghcr.io/username/image:tag
	// For docker.io: docker.io/username/image:tag
	const registryTag = imagePrefix
		? `${registryUrl}/${imagePrefix}/${imageName}`
		: `${registryUrl}/${username}/${imageName}`;

	try {
		writeStream.write(
			`📦 [Enabled Registry] Uploading image to ${registry.registryType} | ${imageName} | ${finalURL} | ${registryTag}\n`,
		);
		const loginCommand = spawnAsync(
			"docker",
			["login", finalURL, "-u", registry.username, "--password-stdin"],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
		);
		loginCommand.child?.stdin?.write(registry.password);
		loginCommand.child?.stdin?.end();
		await loginCommand;

		await spawnAsync("docker", ["tag", imageName, registryTag], (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});

		await spawnAsync("docker", ["push", registryTag], (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});
	} catch (error) {
		console.log(error);
		throw error;
	}
};

export const uploadImageRemoteCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const registry = application.registry;

	if (!registry) {
		throw new Error("Registry not found");
	}

	const { registryUrl, imagePrefix, username } = registry;
	const { appName } = application;
	const imageName = `${appName}:latest`;

	const finalURL = registryUrl;

	// Build registry tag in correct format: registry.com/owner/image:tag
	const registryTag = imagePrefix
		? `${registryUrl}/${imagePrefix}/${imageName}`
		: `${registryUrl}/${username}/${imageName}`;

	try {
		// Escape all user-controlled inputs to prevent command injection
		const escapedRegistryType = escapeShellArg(registry.registryType);
		const escapedRegistryTag = escapeShellArg(registryTag);
		const escapedPassword = escapeShellArg(registry.password);
		const escapedFinalURL = escapeShellArg(finalURL);
		const escapedUsername = escapeShellArg(registry.username);
		const escapedImageName = escapeShellArg(imageName);
		const escapedLogPath = escapeShellArg(logPath);

		// Use printf instead of echo for password to avoid interpretation and logging issues
		// Redirect docker login output to /dev/null to prevent credential leakage in logs
		const command = `
		echo "📦 [Enabled Registry] Uploading image to ${escapedRegistryType} | ${escapedRegistryTag}" >> ${escapedLogPath};
		printf '%s' ${escapedPassword} | docker login ${escapedFinalURL} -u ${escapedUsername} --password-stdin > /dev/null 2>&1 || { 
			echo "❌ Registry Login Failed" >> ${escapedLogPath};
			exit 1;
		}
		echo "✅ Registry Login Success" >> ${escapedLogPath};
		docker tag ${escapedImageName} ${escapedRegistryTag} >> ${escapedLogPath} 2>> ${escapedLogPath} || { 
			echo "❌ Error tagging image" >> ${escapedLogPath};
			exit 1;
		}
		echo "✅ Image Tagged" >> ${escapedLogPath};
		docker push ${escapedRegistryTag} 2>> ${escapedLogPath} || { 
			echo "❌ Error pushing image" >> ${escapedLogPath};
			exit 1;
		}
			echo "✅ Image Pushed" >> ${escapedLogPath};
		`;
		return command;
	} catch (error) {
		throw error;
	}
};
