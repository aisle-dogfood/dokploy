import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mongo } from "@dokploy/server/services/mongo";
import type { z } from "zod";
import { getS3Credentials, getS3CredentialsEnv } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

export const restoreMongoBackup = async (
	mongo: Mongo,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databasePassword, databaseUser, serverId } = mongo;

		const rcloneEnv = getS3CredentialsEnv(destination);
		const bucketPath = `s3:/${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupInput.backupFile}`;
		const rcloneCommand = `rclone copy "${backupPath}"`;

		const command = getRestoreCommand({
			appName,
			type: "mongo",
			credentials: {
				database: backupInput.databaseName,
				databaseUser,
				databasePassword,
			},
			restoreType: "database",
			rcloneCommand,
			backupFile: backupInput.backupFile,
		});

		emit("Starting restore...");

		emit(`Executing restore command`);

		if (serverId) {
			// For remote execution, prepend environment variable exports
			const envExports = Object.entries(rcloneEnv)
				.map(([key, value]) => `export ${key}="${value}"`)
				.join("; ");
			const remoteCommand = `${envExports}; ${command}`;
			await execAsyncRemote(serverId, remoteCommand);
		} else {
			await execAsync(command, { env: { ...process.env, ...rcloneEnv } });
		}

		emit("Restore completed successfully!");
	} catch (error) {
		console.error(error);
		emit(
			`Error: ${
				error instanceof Error ? error.message : "Error restoring mongo backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mongo backup",
		);
	}
};
