import { db } from "@dokploy/server/db";
import { type apiCreateRegistry, registry } from "@dokploy/server/db/schema";
import { hashPassword } from "@dokploy/server/db/schema/utils";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";

export type Registry = typeof registry.$inferSelect;

export const createRegistry = async (
	input: typeof apiCreateRegistry._type,
	organizationId: string,
) => {
	return await db.transaction(async (tx) => {
		// Store the plaintext password for Docker login before hashing
		const plaintextPassword = input.password;

		const newRegistry = await tx
			.insert(registry)
			.values({
				...input,
				// Hash the password before storing
				password: await hashPassword(input.password),
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newRegistry) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input:  Inserting registry",
			});
		}

		if (IS_CLOUD && !input.serverId && input.serverId !== "none") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}
		// Use the plaintext password for Docker login (not the hash)
		const loginCommand = `echo ${plaintextPassword} | docker login ${input.registryUrl} --username ${input.username} --password-stdin`;
		if (input.serverId && input.serverId !== "none") {
			await execAsyncRemote(input.serverId, loginCommand);
		} else if (newRegistry.registryType === "cloud") {
			await execAsync(loginCommand);
		}

		return newRegistry;
	});
};

export const removeRegistry = async (registryId: string) => {
	try {
		const response = await db
			.delete(registry)
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (!response) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Registry not found",
			});
		}

		if (!IS_CLOUD) {
			await execAsync(`docker logout ${response.registryUrl}`);
		}

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error removing this registry",
			cause: error,
		});
	}
};

export const updateRegistry = async (
	registryId: string,
	registryData: Partial<Registry> & { serverId?: string | null },
) => {
	try {
		// Store the plaintext password for Docker login before hashing
		const plaintextPassword = registryData.password;

		// Prepare the update data
		const updateData = { ...registryData };

		// Hash the password if it's being updated
		if (updateData.password) {
			updateData.password = await hashPassword(updateData.password);
		}

		const response = await db
			.update(registry)
			.set(updateData)
			.where(eq(registry.registryId, registryId))
			.returning()
			.then((res) => res[0]);

		if (
			IS_CLOUD &&
			!registryData?.serverId &&
			registryData?.serverId !== "none"
		) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Select a server to add the registry",
			});
		}

		// Only run Docker login if password was provided
		if (plaintextPassword) {
			const loginCommand = `echo ${plaintextPassword} | docker login ${response?.registryUrl} --username ${response?.username} --password-stdin`;

			if (registryData?.serverId && registryData?.serverId !== "none") {
				await execAsyncRemote(registryData.serverId, loginCommand);
			} else if (response?.registryType === "cloud") {
				await execAsync(loginCommand);
			}
		}

		return response;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error updating this registry";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};

export const findRegistryById = async (registryId: string) => {
	const registryResponse = await db.query.registry.findFirst({
		where: eq(registry.registryId, registryId),
		columns: {
			password: false,
		},
	});
	if (!registryResponse) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Registry not found",
		});
	}
	return registryResponse;
};

export const findAllRegistryByOrganizationId = async (
	organizationId: string,
) => {
	const registryResponse = await db.query.registry.findMany({
		where: eq(registry.organizationId, organizationId),
	});
	return registryResponse;
};
