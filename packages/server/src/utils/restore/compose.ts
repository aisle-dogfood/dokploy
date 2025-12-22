import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import type { Destination } from "@dokploy/server/services/destination";
import type { z } from "zod";
import { getS3Credentials, getS3CredentialsEnv } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

interface DatabaseCredentials {
	databaseUser?: string;
	databasePassword?: string;
}

export const restoreComposeBackup = async (
	compose: Compose,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		if (backupInput.databaseType === "web-server") {
			return;
		}
		const { serverId, appName, composeType } = compose;

		const rcloneEnv = getS3CredentialsEnv(destination);
		const bucketPath = `s3:/${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupInput.backupFile}`;
		let rcloneCommand = `rclone cat "${backupPath}" | gunzip`;

		if (backupInput.metadata?.mongo) {
			rcloneCommand = `rclone copy "${backupPath}"`;
		}

		let credentials: DatabaseCredentials;

		switch (backupInput.databaseType) {
			case "postgres":
				credentials = {
					databaseUser: backupInput.metadata?.postgres?.databaseUser,
				};
				break;
			case "mariadb":
				credentials = {
					databaseUser: backupInput.metadata?.mariadb?.databaseUser,
					databasePassword: backupInput.metadata?.mariadb?.databasePassword,
				};
				break;
			case "mysql":
				credentials = {
					databasePassword: backupInput.metadata?.mysql?.databaseRootPassword,
				};
				break;
			case "mongo":
				credentials = {
					databaseUser: backupInput.metadata?.mongo?.databaseUser,
					databasePassword: backupInput.metadata?.mongo?.databasePassword,
				};
				break;
		}

		const restoreCommand = getRestoreCommand({
			appName: appName,
			serviceName: backupInput.metadata?.serviceName,
			type: backupInput.databaseType,
			credentials: {
				database: backupInput.databaseName,
				...credentials,
			},
			restoreType: composeType,
			rcloneCommand,
		});

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);

		emit(`Executing restore command`);

		if (serverId) {
			// For remote execution, prepend environment variable exports
			const envExports = Object.entries(rcloneEnv)
				.map(([key, value]) => `export ${key}="${value}"`)
				.join("; ");
			const remoteCommand = `${envExports}; ${restoreCommand}`;
			await execAsyncRemote(serverId, remoteCommand);
		} else {
			await execAsync(restoreCommand, { env: { ...process.env, ...rcloneEnv } });
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
