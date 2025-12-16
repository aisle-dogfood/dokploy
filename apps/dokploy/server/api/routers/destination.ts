import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
	destinations,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createDestintation,
	execFileAsync,
	execAsyncRemote,
	findDestinationById,
	removeDestinationById,
	updateDestinationById,
	findServerById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";

// Shell escape function to safely escape arguments for shell execution
function shellEscape(arg: string): string {
	// Replace single quotes with '\'' and wrap in single quotes
	return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Safe remote execution wrapper for rclone
async function execRcloneRemote(serverId: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
	// Escape each argument for safe shell execution
	const escapedArgs = args.map(arg => shellEscape(arg));
	const rcloneCommand = `rclone ${escapedArgs.join(" ")}`;
	return await execAsyncRemote(serverId, rcloneCommand);
}

export const destinationRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createDestintation(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the destination",
					cause: error,
				});
			}
		}),
	testConnection: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			const { secretAccessKey, bucket, region, endpoint, accessKey, provider } =
				input;
			try {
				// Build rclone arguments safely
				const rcloneArgs = [
					"ls",
					`--s3-access-key-id=${accessKey}`,
					`--s3-secret-access-key=${secretAccessKey}`,
					`--s3-region=${region}`,
					`--s3-endpoint=${endpoint}`,
					"--s3-no-check-bucket",
					"--s3-force-path-style",
				];
				
				if (provider) {
					rcloneArgs.splice(1, 0, `--s3-provider=${provider}`);
				}
				
				const rcloneDestination = `:s3:${bucket}`;
				rcloneArgs.push(rcloneDestination);

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Server not found",
					});
				}

				if (IS_CLOUD) {
					// For remote execution, use our safe wrapper
					await execRcloneRemote(input.serverId || "", rcloneArgs);
				} else {
					// For local execution, use execFileAsync which is safer
					await execFileAsync("rclone", rcloneArgs);
				}
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error?.message
							: "Error connecting to bucket",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneDestination)
		.query(async ({ input, ctx }) => {
			const destination = await findDestinationById(input.destinationId);
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}
			return destination;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.destinations.findMany({
			where: eq(destinations.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: adminProcedure
		.input(apiRemoveDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);

				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this destination",
					});
				}
				return await removeDestinationById(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw error;
			}
		}),
	update: adminProcedure
		.input(apiUpdateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this destination",
					});
				}
				return await updateDestinationById(input.destinationId, {
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
});
