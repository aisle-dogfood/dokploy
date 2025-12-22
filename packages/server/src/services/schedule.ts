import fs from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { paths } from "../constants";
import { db } from "../db";
import { type Schedule, schedules } from "../db/schema/schedule";
import type {
	createScheduleSchema,
	updateScheduleSchema,
} from "../db/schema/schedule";
import { encodeBase64 } from "../utils/docker/utils";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";

export type ScheduleExtended = Awaited<ReturnType<typeof findScheduleById>>;

export const createSchedule = async (
	input: z.infer<typeof createScheduleSchema>,
) => {
	const { scheduleId, ...rest } = input;
	const [newSchedule] = await db.insert(schedules).values(rest).returning();

	if (
		newSchedule &&
		(newSchedule.scheduleType === "dokploy-server" ||
			newSchedule.scheduleType === "server")
	) {
		await handleScript(newSchedule);
	}

	return newSchedule;
};

export const findScheduleById = async (scheduleId: string) => {
	const schedule = await db.query.schedules.findFirst({
		where: eq(schedules.scheduleId, scheduleId),
		with: {
			application: true,
			compose: true,
			server: true,
		},
	});

	if (!schedule) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Schedule not found",
		});
	}
	return schedule;
};

export const deleteSchedule = async (scheduleId: string) => {
	const schedule = await findScheduleById(scheduleId);
	const serverId =
		schedule?.serverId ||
		schedule?.application?.serverId ||
		schedule?.compose?.serverId;
	const { SCHEDULES_PATH } = paths(!!serverId);

	const appName = schedule?.appName || "";
	
	// Validate appName to prevent path traversal attacks
	// path.basename() strips any directory components, so if they don't match,
	// there was a path traversal attempt
	const sanitizedAppName = path.basename(appName);
	if (sanitizedAppName !== appName || appName.includes("..") || appName === "") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid schedule appName",
		});
	}

	const fullPath = path.join(SCHEDULES_PATH, sanitizedAppName);
	
	if (serverId) {
		// For remote operations, use shell-safe quoting with single quotes
		// and escape any single quotes in the path
		const safePath = fullPath.replace(/'/g, "'\\''");
		const command = `rm -rf '${safePath}'`;
		await execAsyncRemote(serverId, command);
	} else {
		// For local operations, use Node.js filesystem API instead of shell commands
		try {
			await fs.rm(fullPath, { recursive: true, force: true });
		} catch (error) {
			// Ignore errors if the directory doesn't exist
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}

	const scheduleResult = await db
		.delete(schedules)
		.where(eq(schedules.scheduleId, scheduleId));
	if (!scheduleResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Schedule not found",
		});
	}

	return true;
};

export const updateSchedule = async (
	input: z.infer<typeof updateScheduleSchema>,
) => {
	const { scheduleId, ...rest } = input;
	const [updatedSchedule] = await db
		.update(schedules)
		.set(rest)
		.where(eq(schedules.scheduleId, scheduleId))
		.returning();

	if (!updatedSchedule) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Schedule not found",
		});
	}

	if (
		updatedSchedule?.scheduleType === "dokploy-server" ||
		updatedSchedule?.scheduleType === "server"
	) {
		await handleScript(updatedSchedule);
	}

	return updatedSchedule;
};

const handleScript = async (schedule: Schedule) => {
	const { SCHEDULES_PATH } = paths(!!schedule?.serverId);
	const fullPath = path.join(SCHEDULES_PATH, schedule?.appName || "");

	// Add PID and Schedule ID echo by default to all scripts
	const scriptWithPid = `echo "PID: $$ | Schedule ID: ${schedule.scheduleId}"
${schedule?.script || ""}`;

	const encodedContent = encodeBase64(scriptWithPid);
	const script = `
	 	 mkdir -p ${fullPath}
	 	 rm -f ${fullPath}/script.sh
		 touch ${fullPath}/script.sh
		 chmod +x ${fullPath}/script.sh
		 echo "${encodedContent}" | base64 -d > ${fullPath}/script.sh
	`;

	if (schedule?.scheduleType === "dokploy-server") {
		await execAsync(script);
	} else if (schedule?.scheduleType === "server") {
		await execAsyncRemote(schedule?.serverId || "", script);
	}
};
