import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { MySql } from "@dokploy/server/services/mysql";
import type { z } from "zod";
import { getS3Credentials, getS3CredentialsEnv } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

export const restoreMySqlBackup = async (
	mysql: MySql,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseRootPassword, serverId } = mysql;

		const rcloneEnv = getS3CredentialsEnv(destination);
		const bucketPath = `s3:/${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupInput.backupFile}`;

		const rcloneCommand = `rclone cat "${backupPath}" | gunzip`;

		const command = getRestoreCommand({
			appName,
			type: "mysql",
			credentials: {
				database: backupInput.databaseName,
				databasePassword: databaseRootPassword,
			},
			restoreType: "database",
			rcloneCommand,
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
				error instanceof Error ? error.message : "Error restoring mysql backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mysql backup",
		);
	}
};
