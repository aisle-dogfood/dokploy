import { exec, execFile } from "node:child_process";
import util from "node:util";
import { findServerById } from "@dokploy/server/services/server";
import { Client } from "ssh2";

export const execAsync = util.promisify(exec);

interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export const execAsyncStream = (
	command: string,
	onData?: (data: string) => void,
	options: ExecOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
	return new Promise((resolve, reject) => {
		let stdoutComplete = "";
		let stderrComplete = "";

		const childProcess = exec(command, options, (error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve({ stdout: stdoutComplete, stderr: stderrComplete });
		});

		childProcess.stdout?.on("data", (data: Buffer | string) => {
			const stringData = data.toString();
			stdoutComplete += stringData;
			if (onData) {
				onData(stringData);
			}
		});

		childProcess.stderr?.on("data", (data: Buffer | string) => {
			const stringData = data.toString();
			stderrComplete += stringData;
			if (onData) {
				onData(stringData);
			}
		});

		childProcess.on("error", (error) => {
			console.log(error);
			reject(error);
		});
	});
};

export const execFileAsync = async (
	command: string,
	args: string[],
	options: { input?: string } = {},
): Promise<{ stdout: string; stderr: string }> => {
	const child = execFile(command, args);

	if (options.input && child.stdin) {
		child.stdin.write(options.input);
		child.stdin.end();
	}

	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					new Error(`Command failed with code ${code}. Stderr: ${stderr}`),
				);
			}
		});

		child.on("error", reject);
	});
};

export const execAsyncRemote = async (
	serverId: string | null,
	command: string,
	onData?: (data: string) => void,
): Promise<{ stdout: string; stderr: string }> => {
	if (!serverId) return { stdout: "", stderr: "" };
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	let stdout = "";
	let stderr = "";
	return new Promise((resolve, reject) => {
		const conn = new Client();

		sleep(1000);
		conn
			.once("ready", () => {
				conn.exec(command, (err, stream) => {
					if (err) {
						onData?.(err.message);
						throw err;
					}
					stream
						.on("close", (code: number, _signal: string) => {
							conn.end();
							if (code === 0) {
								resolve({ stdout, stderr });
							} else {
								reject(
									new Error(
										`Command exited with code ${code}. Stderr: ${stderr}, command: ${command}`,
									),
								);
							}
						})
						.on("data", (data: string) => {
							stdout += data.toString();
							onData?.(data.toString());
						})
						.stderr.on("data", (data) => {
							stderr += data.toString();
							onData?.(data.toString());
						});
				});
			})
			.on("error", (err) => {
				conn.end();
				if (err.level === "client-authentication") {
					onData?.(
						`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
					);
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
						),
					);
				} else {
					onData?.(`SSH connection error: ${err.message}`);
					reject(new Error(`SSH connection error: ${err.message}`));
				}
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				timeout: 99999,
			});
	});
};

export const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

interface RcloneS3Options {
	accessKey: string;
	secretAccessKey: string;
	region: string;
	endpoint: string;
	provider?: string;
	bucket: string;
}

/**
 * Sanitize input to prevent shell injection by escaping special characters
 */
const sanitizeInput = (input: string): string => {
	// Remove or escape shell metacharacters
	return input.replace(/[;&|`$()\\<>'"]/g, "");
};

/**
 * Executes rclone ls command securely with S3 credentials passed via environment variables
 * instead of command-line flags to prevent secret exposure and command injection.
 */
export const execRcloneS3Test = async (
	options: RcloneS3Options,
	serverId?: string | null,
): Promise<{ stdout: string; stderr: string }> => {
	const { accessKey, secretAccessKey, region, endpoint, provider, bucket } =
		options;

	// Sanitize bucket name to prevent injection
	const sanitizedBucket = sanitizeInput(bucket);

	// Set up environment variables for rclone
	const env = {
		...process.env,
		RCLONE_CONFIG_S3TEMP_TYPE: "s3",
		RCLONE_CONFIG_S3TEMP_ACCESS_KEY_ID: accessKey,
		RCLONE_CONFIG_S3TEMP_SECRET_ACCESS_KEY: secretAccessKey,
		RCLONE_CONFIG_S3TEMP_REGION: region,
		RCLONE_CONFIG_S3TEMP_ENDPOINT: endpoint,
		RCLONE_CONFIG_S3TEMP_NO_CHECK_BUCKET: "true",
		RCLONE_CONFIG_S3TEMP_FORCE_PATH_STYLE: "true",
	};

	if (provider) {
		env.RCLONE_CONFIG_S3TEMP_PROVIDER = provider;
	}

	const rcloneArgs = ["ls", `s3temp:${sanitizedBucket}`];

	if (serverId) {
		return execRcloneRemote(serverId, rcloneArgs, env);
	}
	return execFileWithEnv("rclone", rcloneArgs, { env });
};

/**
 * Executes rclone command on a remote server via SSH with environment variables
 */
const execRcloneRemote = async (
	serverId: string,
	args: string[],
	env: Record<string, string>,
): Promise<{ stdout: string; stderr: string }> => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	// Build environment variable export statements
	const envVars = Object.entries(env)
		.filter(([key]) => key.startsWith("RCLONE_CONFIG_"))
		.map(([key, value]) => {
			// Escape single quotes in values
			const escapedValue = value.replace(/'/g, "'\\''");
			return `export ${key}='${escapedValue}'`;
		})
		.join("; ");

	// Build safe command with properly quoted arguments
	const quotedArgs = args.map((arg) => {
		// Escape single quotes in arguments
		const escapedArg = arg.replace(/'/g, "'\\''");
		return `'${escapedArg}'`;
	});
	const command = `${envVars}; rclone ${quotedArgs.join(" ")}`;

	let stdout = "";
	let stderr = "";
	return new Promise((resolve, reject) => {
		const conn = new Client();

		sleep(1000);
		conn
			.once("ready", () => {
				conn.exec(command, (err, stream) => {
					if (err) {
						throw err;
					}
					stream
						.on("close", (code: number) => {
							conn.end();
							if (code === 0) {
								resolve({ stdout, stderr });
							} else {
								reject(
									new Error(`Command exited with code ${code}. Stderr: ${stderr}`),
								);
							}
						})
						.on("data", (data: string) => {
							stdout += data.toString();
						})
						.stderr.on("data", (data) => {
							stderr += data.toString();
						});
				});
			})
			.on("error", (err) => {
				conn.end();
				if (err.level === "client-authentication") {
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. Error: ${err.message}`,
						),
					);
				} else {
					reject(new Error(`SSH connection error: ${err.message}`));
				}
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				timeout: 99999,
			});
	});
};

/**
 * Internal wrapper around execFile with timeout and environment variable support
 */
const execFileWithEnv = async (
	command: string,
	args: string[],
	options: { env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string }> => {
	const child = execFile(command, args, {
		env: options.env,
		timeout: 30000, // 30 second timeout
	});

	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(
					new Error(`Command failed with code ${code}. Stderr: ${stderr}`),
				);
			}
		});

		child.on("error", reject);
	});
};
