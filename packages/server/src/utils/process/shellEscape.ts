/**
 * Escapes a string for safe use in a shell command.
 * 
 * This function wraps the input in single quotes and escapes any single quotes
 * within the input by replacing them with '\'' (end quote, escaped quote, start quote).
 * This is a secure approach that prevents command injection.
 * 
 * @param arg - The string to escape
 * @returns The escaped string safe for use in shell commands
 * 
 * @example
 * escapeShellArg("hello world") // returns 'hello world'
 * escapeShellArg("it's") // returns 'it'\''s'
 * escapeShellArg("$(whoami)") // returns '$(whoami)' (not executed)
 * escapeShellArg("foo; rm -rf /") // returns 'foo; rm -rf /' (semicolon treated as literal)
 */
export const escapeShellArg = (arg: string): string => {
	// Replace each single quote with '\'' (end quote, escaped quote, start quote)
	// Then wrap the whole thing in single quotes
	return `'${arg.replace(/'/g, "'\\''")}'`;
};

/**
 * Escapes multiple arguments for use in a shell command.
 * 
 * @param args - Array of strings to escape
 * @returns Array of escaped strings
 */
export const escapeShellArgs = (args: string[]): string[] => {
	return args.map(escapeShellArg);
};
