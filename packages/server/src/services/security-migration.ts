/**
 * Security migration utilities
 * This file contains functions to update existing data to meet new security requirements
 */
import { db } from "@dokploy/server/db";
import { server } from "@dokploy/server/db/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

/**
 * Updates existing servers with empty monitoring tokens to use secure random tokens
 * This should be run once after deploying the security fix
 */
export const updateMonitoringTokens = async () => {
	console.log("Starting monitoring token security migration...");

	try {
		// Get all servers
		const servers = await db.select().from(server);
		let updatedCount = 0;

		for (const srv of servers) {
			const config = srv.metricsConfig;
			
			// Check if the token is empty or whitespace
			if (!config.server.token || config.server.token.trim() === "") {
				const newToken = nanoid(32);
				const updatedConfig = {
					...config,
					server: {
						...config.server,
						token: newToken,
					},
				};

				await db
					.update(server)
					.set({ metricsConfig: updatedConfig })
					.where(eq(server.serverId, srv.serverId));

				console.log(`✅ Updated monitoring token for server: ${srv.name} (${srv.serverId})`);
				updatedCount++;
			}
		}

		console.log(`✅ Migration completed. Updated ${updatedCount} servers with new monitoring tokens.`);
		return { success: true, updatedCount };
	} catch (error) {
		console.error("❌ Error updating monitoring tokens:", error);
		throw error;
	}
};

/**
 * Audits servers to find those using 'root' username
 * This helps identify servers that need to be reconfigured
 */
export const auditRootUsernameUsage = async () => {
	console.log("Auditing servers for root username usage...");

	try {
		const servers = await db.select().from(server);
		const rootServers = servers.filter(srv => srv.username === "root");

		if (rootServers.length > 0) {
			console.warn(`⚠️  Found ${rootServers.length} server(s) using 'root' username:`);
			for (const srv of rootServers) {
				console.warn(`  - ${srv.name} (${srv.ipAddress})`);
			}
			console.warn("⚠️  Please update these servers to use a dedicated non-root user with appropriate sudo privileges.");
		} else {
			console.log("✅ No servers using 'root' username found.");
		}

		return { totalServers: servers.length, rootServers: rootServers.length };
	} catch (error) {
		console.error("❌ Error auditing root username usage:", error);
		throw error;
	}
};
