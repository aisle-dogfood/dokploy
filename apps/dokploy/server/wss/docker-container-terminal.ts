import type http from "node:http";
import { findServerById, validateRequest } from "@dokploy/server";
import { spawn } from "node-pty";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { getShell } from "./utils";

/**
 * Validates and sanitizes a Docker container ID or name.
 * Allows only alphanumeric characters, hyphens, underscores, and dots.
 * This prevents command injection attacks.
 */
function validateContainerId(containerId: string): string {
	if (!containerId || typeof containerId !== "string") {
		throw new Error("Invalid container ID");
	}
	// Docker container IDs are hexadecimal (64 chars) or names can be alphanumeric with -, _, .
	if (!/^[a-zA-Z0-9._-]+$/.test(containerId)) {
		throw new Error("Container ID contains invalid characters");
	}
	// Limit length to reasonable maximum (Docker container IDs are 64 chars, names up to 128)
	if (containerId.length > 128) {
		throw new Error("Container ID is too long");
	}
	return containerId;
}

/**
 * Validates a shell path to prevent command injection.
 * Allows only safe characters for shell paths.
 */
function validateShellPath(path: string): string {
	if (!path || typeof path !== "string") {
		throw new Error("Invalid shell path");
	}
	// Allow alphanumeric, forward slashes, dots, hyphens, and underscores
	// This covers common shells like /bin/bash, /bin/sh, /usr/bin/fish, etc.
	if (!/^[a-zA-Z0-9/_.-]+$/.test(path)) {
		throw new Error("Shell path contains invalid characters");
	}
	// Limit length to reasonable maximum
	if (path.length > 256) {
		throw new Error("Shell path is too long");
	}
	return path;
}

/**
 * Escapes a string for safe use in shell commands.
 * Uses single quotes and escapes any single quotes in the input.
 */
function escapeShellArg(arg: string): string {
	// Replace single quotes with '\'' (end quote, escaped quote, start quote)
	return `'${arg.replace(/'/g, "'\\''")}'`;
}

export const setupDockerContainerTerminalWebSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/docker-container-terminal",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/docker-container-terminal") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		const containerId = url.searchParams.get("containerId");
		const activeWay = url.searchParams.get("activeWay");
		const serverId = url.searchParams.get("serverId");
		const { user, session } = await validateRequest(req);

		if (!containerId) {
			ws.close(4000, "containerId no provided");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}
		try {
			// Validate inputs to prevent command injection
			const validatedContainerId = validateContainerId(containerId);
			const validatedActiveWay = validateShellPath(activeWay || "/bin/sh");

			if (serverId) {
				const server = await findServerById(serverId);
				if (!server.sshKeyId)
					throw new Error("No SSH key available for this server");

				const conn = new Client();
				let _stdout = "";
				let _stderr = "";
				conn
					.once("ready", () => {
						// Use escaped arguments to prevent command injection
						const escapedContainerId = escapeShellArg(validatedContainerId);
						const escapedActiveWay = escapeShellArg(validatedActiveWay);
						conn.exec(
							`docker exec -it ${escapedContainerId} ${escapedActiveWay}`,
							{ pty: true },
							(err, stream) => {
								if (err) throw err;

								stream
									.on("close", (code: number, _signal: string) => {
										ws.send(`\nContainer closed with code: ${code}\n`);
										conn.end();
									})
									.on("data", (data: string) => {
										_stdout += data.toString();
										ws.send(data.toString());
									})
									.stderr.on("data", (data) => {
										_stderr += data.toString();
										ws.send(data.toString());
										console.error("Error: ", data.toString());
									});

								ws.on("message", (message) => {
									try {
										let command: string | Buffer[] | Buffer | ArrayBuffer;
										if (Buffer.isBuffer(message)) {
											command = message.toString("utf8");
										} else {
											command = message;
										}
										stream.write(command.toString());
									} catch (error) {
										// @ts-ignore
										const errorMessage = error?.message as unknown as string;
										ws.send(errorMessage);
									}
								});

								ws.on("close", () => {
									stream.end();
								});
							},
						);
					})
					.connect({
						host: server.ipAddress,
						port: server.port,
						username: server.username,
						privateKey: server.sshKey?.privateKey,
					});
			} else {
				// Use direct command execution with proper argument array to prevent command injection
				// This avoids shell interpolation entirely
				const ptyProcess = spawn(
					"docker",
					["exec", "-it", validatedContainerId, validatedActiveWay],
					{},
				);

				ptyProcess.onData((data) => {
					ws.send(data);
				});
				ws.on("close", () => {
					ptyProcess.kill();
				});
				ws.on("message", (message) => {
					try {
						let command: string | Buffer[] | Buffer | ArrayBuffer;
						if (Buffer.isBuffer(message)) {
							command = message.toString("utf8");
						} else {
							command = message;
						}
						ptyProcess.write(command.toString());
					} catch (error) {
						// @ts-ignore
						const errorMessage = error?.message as unknown as string;
						ws.send(errorMessage);
					}
				});
			}
		} catch (error) {
			// @ts-ignore
			const errorMessage = error?.message as unknown as string;

			ws.send(errorMessage);
		}
	});
};
