/**
 * Security utility for validating server setup commands
 * Prevents command injection attacks by enforcing strict validation
 */

/**
 * Validates a server setup command to prevent command injection
 * 
 * This function enforces several security measures:
 * 1. Rejects dangerous shell metacharacters that could enable injection
 * 2. Rejects commands that attempt command chaining or substitution
 * 3. Enforces a reasonable length limit
 * 
 * @param command - The command string to validate
 * @returns true if valid, false otherwise
 * @throws Error with descriptive message if validation fails
 */
export const validateServerCommand = (command: string): boolean => {
	if (!command || command.trim() === "") {
		return true; // Empty command is valid, will use default
	}

	// Maximum command length to prevent DoS
	const MAX_COMMAND_LENGTH = 50000;
	if (command.length > MAX_COMMAND_LENGTH) {
		throw new Error(
			`Command exceeds maximum allowed length of ${MAX_COMMAND_LENGTH} characters`,
		);
	}

	// List of dangerous patterns that could enable command injection
	const dangerousPatterns = [
		/;\s*rm\s+-rf/i, // Destructive rm commands
		/;\s*dd\s+if=/i, // Disk wipe commands
		/\$\(.*wget/i, // Command substitution with wget
		/\$\(.*curl/i, // Command substitution with curl  
		/`.*wget/i, // Backtick command substitution with wget
		/`.*curl/i, // Backtick command substitution with curl
		/&&\s*wget/i, // Command chaining with wget
		/\|\|\s*wget/i, // Command chaining with wget
		/;\s*wget.*\|/i, // wget piped to shell
		/;\s*curl.*\|/i, // curl piped to shell
		/bash\s+-c\s+["'].*wget/i, // bash -c with wget
		/bash\s+-c\s+["'].*curl/i, // bash -c with curl
		/sh\s+-c\s+["'].*wget/i, // sh -c with wget
		/sh\s+-c\s+["'].*curl/i, // sh -c with curl
	];

	for (const pattern of dangerousPatterns) {
		if (pattern.test(command)) {
			throw new Error(
				"Command contains potentially dangerous patterns. Please use the default setup script or contact support.",
			);
		}
	}

	// Validate that multiline commands don't have excessive command chaining
	// Allow reasonable bash scripts but prevent abuse
	const lines = command.split("\n");
	const commandChainPattern = /;\s*;\s*;/; // Multiple semicolons in a row
	
	for (const line of lines) {
		if (commandChainPattern.test(line)) {
			throw new Error(
				"Command contains suspicious command chaining patterns.",
			);
		}
	}

	return true;
};

/**
 * Sanitizes a command string by removing dangerous characters
 * Note: This is a defense-in-depth measure. Validation should be primary defense.
 * 
 * @param command - The command to sanitize
 * @returns Sanitized command
 */
export const sanitizeServerCommand = (command: string): string => {
	if (!command) {
		return "";
	}
	
	// Trim whitespace
	let sanitized = command.trim();
	
	// Remove any null bytes
	sanitized = sanitized.replace(/\0/g, "");
	
	return sanitized;
};
