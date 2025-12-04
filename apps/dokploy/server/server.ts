import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { migration } from "@/server/db/migration";
import {
	IS_CLOUD,
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initCronJobs,
	initSchedules,
	initVolumeBackupsCronJobs,
	initializeNetwork,
	sendDokployRestartNotifications,
	setupDirectories,
} from "@dokploy/server";
import { config } from "dotenv";
import next from "next";
import { setupDockerContainerLogsWebSocketServer } from "./wss/docker-container-logs";
import { setupDockerContainerTerminalWebSocketServer } from "./wss/docker-container-terminal";
import { setupDockerStatsMonitoringSocketServer } from "./wss/docker-stats";
import { setupDrawerLogsWebSocketServer } from "./wss/drawer-logs";
import { setupDeploymentLogsWebSocketServer } from "./wss/listen-deployment";
import { setupTerminalWebSocketServer } from "./wss/terminal";

config({ path: ".env" });
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, turbopack: process.env.TURBOPACK === "1" });
const handle = app.getRequestHandler();

// Function to create server with HTTPS support if certificates are provided
function createServerWithHttpsSupport() {
	const sslKeyPath = process.env.SSL_KEY_PATH;
	const sslCertPath = process.env.SSL_CERT_PATH;
	const sslCaPath = process.env.SSL_CA_PATH;

	// If SSL certificate paths are provided, create HTTPS server
	if (sslKeyPath && sslCertPath) {
		try {
			const httpsOptions: https.ServerOptions = {
				key: fs.readFileSync(sslKeyPath),
				cert: fs.readFileSync(sslCertPath),
			};

			// Add CA certificate if provided
			if (sslCaPath) {
				httpsOptions.ca = fs.readFileSync(sslCaPath);
			}

			console.log("Starting server with HTTPS enabled");
			return https.createServer(httpsOptions, (req, res) => {
				handle(req, res);
			});
		} catch (error) {
			console.error("Failed to load SSL certificates, falling back to HTTP:", error);
			// Fall back to HTTP if certificate loading fails
		}
	}

	// Default to HTTP server (for development or when using reverse proxy like Traefik)
	console.log("Starting server with HTTP (ensure using reverse proxy with SSL/TLS in production)");
	return http.createServer((req, res) => {
		handle(req, res);
	});
}

void app.prepare().then(async () => {
	try {
		const server = createServerWithHttpsSupport();
		const isHttps = process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH;

		// WEBSOCKET
		setupDrawerLogsWebSocketServer(server);
		setupDeploymentLogsWebSocketServer(server);
		setupDockerContainerLogsWebSocketServer(server);
		setupDockerContainerTerminalWebSocketServer(server);
		setupTerminalWebSocketServer(server);
		if (!IS_CLOUD) {
			setupDockerStatsMonitoringSocketServer(server);
		}

		if (process.env.NODE_ENV === "production" && !IS_CLOUD) {
			setupDirectories();
			createDefaultMiddlewares();
			await initializeNetwork();
			createDefaultTraefikConfig();
			createDefaultServerTraefikConfig();
			await migration();
			await initCronJobs();
			await initSchedules();
			await initVolumeBackupsCronJobs();
			await sendDokployRestartNotifications();
		}

		if (IS_CLOUD && process.env.NODE_ENV === "production") {
			await migration();
		}

		server.listen(PORT, HOST);
		const protocol = isHttps ? "https" : "http";
		console.log(`Server Started on: ${protocol}://${HOST}:${PORT}`);
		if (!IS_CLOUD) {
			console.log("Starting Deployment Worker");
			const { deploymentWorker } = await import("./queues/deployments-queue");
			await deploymentWorker.run();
		}
	} catch (e) {
		console.error("Main Server Error", e);
	}
});
