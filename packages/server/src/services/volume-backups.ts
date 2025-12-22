import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
	type createVolumeBackupSchema,
	type updateVolumeBackupSchema,
	volumeBackups,
} from "../db/schema";

export const findVolumeBackupById = async (volumeBackupId: string) => {
	const volumeBackup = await db.query.volumeBackups.findFirst({
		where: eq(volumeBackups.volumeBackupId, volumeBackupId),
		with: {
			application: {
				with: {
					project: true,
				},
			},
			postgres: {
				with: {
					project: true,
				},
			},
			mysql: {
				with: {
					project: true,
				},
			},
			mariadb: {
				with: {
					project: true,
				},
			},
			mongo: {
				with: {
					project: true,
				},
			},
			redis: {
				with: {
					project: true,
				},
			},
			compose: {
				with: {
					project: true,
				},
			},
			destination: true,
		},
	});

	if (!volumeBackup) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Volume backup not found",
		});
	}

	return volumeBackup;
};

export const getVolumeBackupOrganizationId = (
	volumeBackup: Awaited<ReturnType<typeof findVolumeBackupById>>,
): string | null => {
	if (volumeBackup.application?.project) {
		return volumeBackup.application.project.organizationId;
	}
	if (volumeBackup.postgres?.project) {
		return volumeBackup.postgres.project.organizationId;
	}
	if (volumeBackup.mysql?.project) {
		return volumeBackup.mysql.project.organizationId;
	}
	if (volumeBackup.mariadb?.project) {
		return volumeBackup.mariadb.project.organizationId;
	}
	if (volumeBackup.mongo?.project) {
		return volumeBackup.mongo.project.organizationId;
	}
	if (volumeBackup.redis?.project) {
		return volumeBackup.redis.project.organizationId;
	}
	if (volumeBackup.compose?.project) {
		return volumeBackup.compose.project.organizationId;
	}
	return null;
};

export const createVolumeBackup = async (
	volumeBackup: z.infer<typeof createVolumeBackupSchema>,
) => {
	const newVolumeBackup = await db
		.insert(volumeBackups)
		.values(volumeBackup)
		.returning()
		.then((e) => e[0]);

	return newVolumeBackup;
};

export const removeVolumeBackup = async (volumeBackupId: string) => {
	await db
		.delete(volumeBackups)
		.where(eq(volumeBackups.volumeBackupId, volumeBackupId));
};

export const updateVolumeBackup = async (
	volumeBackupId: string,
	volumeBackup: z.infer<typeof updateVolumeBackupSchema>,
) => {
	return await db
		.update(volumeBackups)
		.set(volumeBackup)
		.where(eq(volumeBackups.volumeBackupId, volumeBackupId))
		.returning()
		.then((e) => e[0]);
};
