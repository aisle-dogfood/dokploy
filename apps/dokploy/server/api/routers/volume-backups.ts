import { removeJob, schedule, updateJob } from "@/server/utils/backup";
import {
	IS_CLOUD,
	createVolumeBackup,
	findVolumeBackupById,
	getVolumeBackupOrganizationId,
	removeVolumeBackup,
	removeVolumeBackupJob,
	restoreVolume,
	runVolumeBackup,
	scheduleVolumeBackup,
	updateVolumeBackup,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	createVolumeBackupSchema,
	updateVolumeBackupSchema,
	volumeBackups,
} from "@dokploy/server/db/schema";
import {
	execAsyncRemote,
	execAsyncStream,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const volumeBackupsRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				volumeBackupType: z.enum([
					"application",
					"postgres",
					"mysql",
					"mariadb",
					"mongo",
					"redis",
					"compose",
				]),
			}),
		)
		.query(async ({ input, ctx }) => {
			// First, verify the service belongs to the user's organization
			let service: { project: { organizationId: string } } | undefined;

			switch (input.volumeBackupType) {
				case "application":
					service = await db.query.applications.findFirst({
						where: eq(db.query.applications._.table.applicationId, input.id),
						with: { project: true },
					});
					break;
				case "postgres":
					service = await db.query.postgres.findFirst({
						where: eq(db.query.postgres._.table.postgresId, input.id),
						with: { project: true },
					});
					break;
				case "mysql":
					service = await db.query.mysql.findFirst({
						where: eq(db.query.mysql._.table.mysqlId, input.id),
						with: { project: true },
					});
					break;
				case "mariadb":
					service = await db.query.mariadb.findFirst({
						where: eq(db.query.mariadb._.table.mariadbId, input.id),
						with: { project: true },
					});
					break;
				case "mongo":
					service = await db.query.mongo.findFirst({
						where: eq(db.query.mongo._.table.mongoId, input.id),
						with: { project: true },
					});
					break;
				case "redis":
					service = await db.query.redis.findFirst({
						where: eq(db.query.redis._.table.redisId, input.id),
						with: { project: true },
					});
					break;
				case "compose":
					service = await db.query.compose.findFirst({
						where: eq(db.query.compose._.table.composeId, input.id),
						with: { project: true },
					});
					break;
			}

			if (!service) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Service not found",
				});
			}

			if (service.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access volume backups for this service",
				});
			}

			return await db.query.volumeBackups.findMany({
				where: eq(volumeBackups[`${input.volumeBackupType}Id`], input.id),
				with: {
					application: true,
					postgres: true,
					mysql: true,
					mariadb: true,
					mongo: true,
					redis: true,
					compose: true,
				},
			});
		}),
	create: protectedProcedure
		.input(createVolumeBackupSchema)
		.mutation(async ({ input }) => {
			const newVolumeBackup = await createVolumeBackup(input);

			if (newVolumeBackup?.enabled) {
				if (IS_CLOUD) {
					await schedule({
						cronSchedule: newVolumeBackup.cronExpression,
						volumeBackupId: newVolumeBackup.volumeBackupId,
						type: "volume-backup",
					});
				} else {
					await scheduleVolumeBackup(newVolumeBackup.volumeBackupId);
				}
			}
			return newVolumeBackup;
		}),
	one: protectedProcedure
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
			}),
		)
		.query(async ({ input, ctx }) => {
			const volumeBackup = await findVolumeBackupById(input.volumeBackupId);
			const organizationId = getVolumeBackupOrganizationId(volumeBackup);

			if (!organizationId || organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this volume backup",
				});
			}

			return volumeBackup;
		}),
	delete: protectedProcedure
		.input(
			z.object({
				volumeBackupId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const volumeBackup = await findVolumeBackupById(input.volumeBackupId);
			const organizationId = getVolumeBackupOrganizationId(volumeBackup);

			if (!organizationId || organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this volume backup",
				});
			}

			return await removeVolumeBackup(input.volumeBackupId);
		}),
	update: protectedProcedure
		.input(updateVolumeBackupSchema)
		.mutation(async ({ input, ctx }) => {
			// Verify organization authorization before updating
			const volumeBackup = await findVolumeBackupById(input.volumeBackupId);
			const organizationId = getVolumeBackupOrganizationId(volumeBackup);

			if (!organizationId || organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this volume backup",
				});
			}

			const updatedVolumeBackup = await updateVolumeBackup(
				input.volumeBackupId,
				input,
			);

			if (!updatedVolumeBackup) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Volume backup not found",
				});
			}

			if (IS_CLOUD) {
				if (updatedVolumeBackup.enabled) {
					await updateJob({
						cronSchedule: updatedVolumeBackup.cronExpression,
						volumeBackupId: updatedVolumeBackup.volumeBackupId,
						type: "volume-backup",
					});
				} else {
					await removeJob({
						cronSchedule: updatedVolumeBackup.cronExpression,
						volumeBackupId: updatedVolumeBackup.volumeBackupId,
						type: "volume-backup",
					});
				}
			} else {
				if (updatedVolumeBackup?.enabled) {
					removeVolumeBackupJob(updatedVolumeBackup.volumeBackupId);
					scheduleVolumeBackup(updatedVolumeBackup.volumeBackupId);
				} else {
					removeVolumeBackupJob(updatedVolumeBackup.volumeBackupId);
				}
			}
			return updatedVolumeBackup;
		}),

	runManually: protectedProcedure
		.input(z.object({ volumeBackupId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const volumeBackup = await findVolumeBackupById(input.volumeBackupId);
			const organizationId = getVolumeBackupOrganizationId(volumeBackup);

			if (!organizationId || organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to run this volume backup",
				});
			}

			try {
				return await runVolumeBackup(input.volumeBackupId);
			} catch (error) {
				console.error(error);
				return false;
			}
		}),
	restoreVolumeBackupWithLogs: protectedProcedure
		.meta({
			openapi: {
				enabled: false,
				path: "/restore-volume-backup-with-logs",
				method: "POST",
				override: true,
			},
		})
		.input(
			z.object({
				backupFileName: z.string().min(1),
				destinationId: z.string().min(1),
				volumeName: z.string().min(1),
				id: z.string().min(1),
				serviceType: z.enum(["application", "compose"]),
				serverId: z.string().optional(),
			}),
		)
		.subscription(async ({ input, ctx }) => {
			// Verify organization authorization before restoring
			let service: { project: { organizationId: string } } | undefined;

			if (input.serviceType === "application") {
				service = await db.query.applications.findFirst({
					where: eq(db.query.applications._.table.applicationId, input.id),
					with: { project: true },
				});
			} else if (input.serviceType === "compose") {
				service = await db.query.compose.findFirst({
					where: eq(db.query.compose._.table.composeId, input.id),
					with: { project: true },
				});
			}

			if (!service) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Service not found",
				});
			}

			if (service.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to restore volume backups for this service",
				});
			}

			return observable<string>((emit) => {
				const runRestore = async () => {
					try {
						emit.next("🚀 Starting volume restore process...");
						emit.next(`📂 Backup File: ${input.backupFileName}`);
						emit.next(`🔧 Volume Name: ${input.volumeName}`);
						emit.next(`🏷️ Service Type: ${input.serviceType}`);
						emit.next(""); // Empty line for better readability

						// Generate the restore command
						const restoreCommand = await restoreVolume(
							input.id,
							input.destinationId,
							input.volumeName,
							input.backupFileName,
							input.serverId || "",
							input.serviceType,
						);

						emit.next("📋 Generated restore command:");
						emit.next("▶️ Executing restore...");
						emit.next(""); // Empty line

						// Execute the restore command with real-time output
						if (input.serverId) {
							emit.next(`🌐 Executing on remote server: ${input.serverId}`);
							await execAsyncRemote(input.serverId, restoreCommand, (data) => {
								emit.next(data);
							});
						} else {
							emit.next("🖥️ Executing on local server");
							await execAsyncStream(restoreCommand, (data) => {
								emit.next(data);
							});
						}

						emit.next("");
						emit.next("✅ Volume restore completed successfully!");
						emit.next(
							"🎉 All containers/services have been restarted with the restored volume.",
						);
					} catch {
						emit.next("");
						emit.next("❌ Volume restore failed!");
					} finally {
						emit.complete();
					}
				};

				// Start the restore process
				runRestore();
			});
		}),
});
