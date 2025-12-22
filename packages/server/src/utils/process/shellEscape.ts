/**
 * Escapes a string for safe use in shell commands by wrapping it in single quotes
 * and properly handling any single quotes within the string.
 * 
 * This prevents command injection attacks when interpolating user-controlled
 * data into shell commands.
 * 
 * @param str - The string to escape
 * @returns The escaped string safe for shell interpolation
 * 
 * @example
 * ```typescript
 * const userInput = "test'; rm -rf /; echo '";
 * const safe = escapeShellArg(userInput);
 * // safe = 'test'\''s; rm -rf /; echo '\'''
 * ```
 */
export const escapeShellArg = (str: string): string => {
	// Replace each single quote with '\'' (end quote, escaped quote, start quote)
	// Then wrap the entire string in single quotes
	return `'${str.replace(/'/g, "'\\''")}'`;
};
