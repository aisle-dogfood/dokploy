import { docker } from "@dokploy/server/constants";
import { findServerById } from "@dokploy/server/services/server";
import Dockerode from "dockerode";

export const getRemoteDocker = async (serverId?: string | null) => {
	if (!serverId) return docker;
	const server = await findServerById(serverId);
	if (!server.sshKeyId) return docker;
	
	// Security Warning: Check if root user is being used
	if (server.username === "root") {
		console.warn(
			`⚠️  SECURITY WARNING: Remote Docker connection to server "${server.name}" (${server.serverId}) is using 'root' user. ` +
			`Consider using a non-root user with sudo privileges for better security.`
		);
	}
	
	const dockerode = new Dockerode({
		host: server.ipAddress,
		port: server.port,
		username: server.username,
		protocol: "ssh",
		// @ts-ignore
		sshOptions: {
			privateKey: server.sshKey?.privateKey,
		},
	});

	return dockerode;
};
