import type { WriteStream } from "node:fs";
import type { ApplicationNested } from "../builders";
import { spawnAsync } from "../process/spawnAsync";

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
		const command = `
		echo "📦 [Enabled Registry] Uploading image to '${registry.registryType}' | '${registryTag}'" >> ${logPath};
		TEMP_PASSWORD_FILE=\$(mktemp) || {
			echo "❌ Failed to create temporary password file" >> ${logPath};
			exit 1;
		}
		chmod 600 "\$TEMP_PASSWORD_FILE" || {
			rm -f "\$TEMP_PASSWORD_FILE";
			echo "❌ Failed to set secure permissions on password file" >> ${logPath};
			exit 1;
		}
		cat > "\$TEMP_PASSWORD_FILE" << 'DOKPLOY_PASSWORD_EOF'
${registry.password}
DOKPLOY_PASSWORD_EOF
		docker login ${finalURL} -u ${registry.username} --password-stdin < "\$TEMP_PASSWORD_FILE" >> ${logPath} 2>> ${logPath}
		LOGIN_RESULT=\$?
		rm -f "\$TEMP_PASSWORD_FILE"
		if [ \$LOGIN_RESULT -ne 0 ]; then
			echo "❌ DockerHub Failed" >> ${logPath};
			exit 1;
		fi
		echo "✅ Registry Login Success" >> ${logPath};
		docker tag ${imageName} ${registryTag} >> ${logPath} 2>> ${logPath} || { 
			echo "❌ Error tagging image" >> ${logPath};
			exit 1;
		}
		echo "✅ Image Tagged" >> ${logPath};
		docker push ${registryTag} 2>> ${logPath} || { 
			echo "❌ Error pushing image" >> ${logPath};
			exit 1;
		}
			echo "✅ Image Pushed" >> ${logPath};
		`;
		return command;
	} catch (error) {
		throw error;
	}
};
