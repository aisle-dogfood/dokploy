import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getBackupCommand, getS3Credentials, getS3CredentialsEnv, normalizeS3Path } from "./utils";

export const runMariadbBackup = async (
	mariadb: Mariadb,
	backup: BackupSchedule,
) => {
	const { projectId, name } = mariadb;
	const project = await findProjectById(projectId);
	const { prefix } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MariaDB Backup",
		description: "MariaDB Backup",
	});
	try {
		const rcloneEnv = getS3CredentialsEnv(destination);
		const rcloneDestination = `s3:/${destination.bucket}/${bucketDestination}`;
		const rcloneCommand = `rclone rcat "${rcloneDestination}"`;

		const backupCommand = getBackupCommand(
			backup,
			rcloneCommand,
			deployment.logPath,
		);
		if (mariadb.serverId) {
			// For remote execution, prepend environment variable exports
			const envExports = Object.entries(rcloneEnv)
				.map(([key, value]) => `export ${key}="${value}"`)
				.join("; ");
			const remoteCommand = `${envExports}; ${backupCommand}`;
			await execAsyncRemote(mariadb.serverId, remoteCommand);
		} else {
			await execAsync(backupCommand, {
				shell: "/bin/bash",
				env: { ...process.env, ...rcloneEnv },
			});
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "success",
			organizationId: project.organizationId,
			databaseName: backup.database,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
			databaseName: backup.database,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
