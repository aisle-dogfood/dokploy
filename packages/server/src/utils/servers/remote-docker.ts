import { docker } from "@dokploy/server/constants";
import { findServerById } from "@dokploy/server/services/server";
import Dockerode from "dockerode";

export const getRemoteDocker = async (serverId?: string | null) => {
	if (!serverId) return docker;
	const server = await findServerById(serverId);
	if (!server.sshKeyId) return docker;

	// Security check: Warn about root username usage
	if (server.username === "root") {
		console.warn(
			`WARNING: Using 'root' user for SSH connections to server ${server.name} (${server.ipAddress}). This is not recommended for security reasons.`,
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
