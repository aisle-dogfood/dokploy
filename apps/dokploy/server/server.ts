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

// SSL/TLS certificate configuration
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
const SSL_CA_PATH = process.env.SSL_CA_PATH;

void app.prepare().then(async () => {
	try {
		let server: http.Server | https.Server;
		let protocol = "http";

		// Create HTTPS server if SSL certificates are provided
		if (SSL_KEY_PATH && SSL_CERT_PATH) {
			try {
				const httpsOptions: https.ServerOptions = {
					key: fs.readFileSync(SSL_KEY_PATH),
					cert: fs.readFileSync(SSL_CERT_PATH),
				};

				// Add CA certificate if provided
				if (SSL_CA_PATH) {
					httpsOptions.ca = fs.readFileSync(SSL_CA_PATH);
				}

				server = https.createServer(httpsOptions, (req, res) => {
					handle(req, res);
				});
				protocol = "https";
				console.log("HTTPS server configured with SSL certificates");
			} catch (error) {
				console.error("Failed to load SSL certificates, falling back to HTTP:", error);
				server = http.createServer((req, res) => {
					handle(req, res);
				});
			}
		} else {
			// Fall back to HTTP server
			server = http.createServer((req, res) => {
				handle(req, res);
			});
			if (process.env.NODE_ENV === "production") {
				console.warn("WARNING: Running in production mode without HTTPS. Consider configuring SSL certificates via SSL_KEY_PATH and SSL_CERT_PATH environment variables.");
			}
		}

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
