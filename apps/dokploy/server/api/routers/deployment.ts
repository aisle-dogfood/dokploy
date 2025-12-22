import { db } from "@/server/db";
import {
	apiFindAllByApplication,
	apiFindAllByCompose,
	apiFindAllByServer,
	apiFindAllByType,
	deployments,
} from "@/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
	execFileAsync,
	findAllDeploymentsByApplicationId,
	findAllDeploymentsByComposeId,
	findAllDeploymentsByServerId,
	findApplicationById,
	findComposeById,
	findDeploymentById,
	findServerById,
	updateDeploymentStatus,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const deploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllByApplication)
		.query(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await findAllDeploymentsByApplicationId(input.applicationId);
		}),

	allByCompose: protectedProcedure
		.input(apiFindAllByCompose)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (compose.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}
			return await findAllDeploymentsByComposeId(input.composeId);
		}),
	allByServer: protectedProcedure
		.input(apiFindAllByServer)
		.query(async ({ input, ctx }) => {
			const server = await findServerById(input.serverId);
			if (server.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this server",
				});
			}
			return await findAllDeploymentsByServerId(input.serverId);
		}),

	allByType: protectedProcedure
		.input(apiFindAllByType)
		.query(async ({ input }) => {
			const deploymentsList = await db.query.deployments.findMany({
				where: eq(deployments[`${input.type}Id`], input.id),
				orderBy: desc(deployments.createdAt),
				with: {
					rollback: true,
				},
			});

			return deploymentsList;
		}),

	killProcess: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const deployment = await findDeploymentById(input.deploymentId);

			// Enforce organization ownership check before killing process
			const organizationId =
				deployment.application?.project?.organizationId ||
				deployment.compose?.project?.organizationId;

			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to kill this deployment process",
				});
			}

			if (!deployment.pid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Deployment is not running",
				});
			}

			// Strictly validate PID to ensure it contains only digits
			if (!/^\d+$/.test(deployment.pid)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid PID format",
				});
			}

			// Use execFile for local execution to avoid shell injection
			// For remote execution, PID validation above prevents injection
			if (deployment.schedule?.serverId) {
				// For remote execution, build command safely with validated PID
				const command = `kill -9 ${deployment.pid}`;
				await execAsyncRemote(deployment.schedule.serverId, command);
			} else {
				// For local execution, use execFile with argument array (no shell)
				await execFileAsync("kill", ["-9", deployment.pid]);
			}

			await updateDeploymentStatus(deployment.deploymentId, "error");
		}),
});
