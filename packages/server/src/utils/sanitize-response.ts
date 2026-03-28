/**
 * Utilities for sanitizing sensitive data from API responses
 */

const REDACTED = "[REDACTED]";

/**
 * Sanitize destination object to prevent exposing secrets
 */
export const sanitizeDestination = <T extends Record<string, unknown>>(
	destination: T,
): T => {
	if (!destination) {
		return destination;
	}

	return {
		...destination,
		secretAccessKey: REDACTED,
	} as T;
};

/**
 * Sanitize registry object to prevent exposing passwords
 */
export const sanitizeRegistry = <T extends Record<string, unknown>>(
	registry: T,
): T => {
	if (!registry) {
		return registry;
	}

	return {
		...registry,
		password: REDACTED,
	} as T;
};

/**
 * Sanitize security object to prevent exposing passwords
 */
export const sanitizeSecurity = <T extends Record<string, unknown>>(
	security: T,
): T => {
	if (!security) {
		return security;
	}

	return {
		...security,
		password: REDACTED,
	} as T;
};

/**
 * Sanitize certificate object to prevent exposing private keys
 */
export const sanitizeCertificate = <T extends Record<string, unknown>>(
	certificate: T,
): T => {
	if (!certificate) {
		return certificate;
	}

	return {
		...certificate,
		privateKey: REDACTED,
	} as T;
};

/**
 * Sanitize Redis object to prevent exposing passwords
 */
export const sanitizeRedis = <T extends Record<string, unknown>>(
	redis: T,
): T => {
	if (!redis) {
		return redis;
	}

	return {
		...redis,
		databasePassword: REDACTED,
		password: REDACTED,
	} as T;
};

/**
 * Sanitize SSH key object to prevent exposing private keys
 */
export const sanitizeSshKey = <T extends Record<string, unknown>>(
	sshKey: T,
): T => {
	if (!sshKey) {
		return sshKey;
	}

	return {
		...sshKey,
		privateKey: REDACTED,
	} as T;
};

/**
 * Sanitize email notification config to prevent exposing passwords
 */
export const sanitizeEmail = <T extends Record<string, unknown>>(
	email: T,
): T => {
	if (!email) {
		return email;
	}

	return {
		...email,
		password: REDACTED,
	} as T;
};

/**
 * Sanitize Telegram notification config to prevent exposing bot tokens
 */
export const sanitizeTelegram = <T extends Record<string, unknown>>(
	telegram: T,
): T => {
	if (!telegram) {
		return telegram;
	}

	return {
		...telegram,
		botToken: REDACTED,
	} as T;
};

/**
 * Sanitize Slack notification config to prevent exposing webhook URLs
 */
export const sanitizeSlack = <T extends Record<string, unknown>>(
	slack: T,
): T => {
	if (!slack) {
		return slack;
	}

	return {
		...slack,
		webhookUrl: REDACTED,
	} as T;
};

/**
 * Sanitize Discord notification config to prevent exposing webhook URLs
 */
export const sanitizeDiscord = <T extends Record<string, unknown>>(
	discord: T,
): T => {
	if (!discord) {
		return discord;
	}

	return {
		...discord,
		webhookUrl: REDACTED,
	} as T;
};

/**
 * Sanitize Gotify notification config to prevent exposing app tokens
 */
export const sanitizeGotify = <T extends Record<string, unknown>>(
	gotify: T,
): T => {
	if (!gotify) {
		return gotify;
	}

	return {
		...gotify,
		appToken: REDACTED,
	} as T;
};

/**
 * Sanitize notification object with all its nested configs
 */
export const sanitizeNotification = <T extends Record<string, unknown>>(
	notification: T,
): T => {
	if (!notification) {
		return notification;
	}

	const sanitized = { ...notification };

	// Sanitize nested objects if they exist
	if (sanitized.email) {
		sanitized.email = sanitizeEmail(sanitized.email as Record<string, unknown>);
	}
	if (sanitized.telegram) {
		sanitized.telegram = sanitizeTelegram(
			sanitized.telegram as Record<string, unknown>,
		);
	}
	if (sanitized.slack) {
		sanitized.slack = sanitizeSlack(sanitized.slack as Record<string, unknown>);
	}
	if (sanitized.discord) {
		sanitized.discord = sanitizeDiscord(
			sanitized.discord as Record<string, unknown>,
		);
	}
	if (sanitized.gotify) {
		sanitized.gotify = sanitizeGotify(
			sanitized.gotify as Record<string, unknown>,
		);
	}

	return sanitized as T;
};

/**
 * Sanitize MySQL/MariaDB/Postgres/Mongo object to prevent exposing passwords
 */
export const sanitizeDatabase = <T extends Record<string, unknown>>(
	database: T,
): T => {
	if (!database) {
		return database;
	}

	return {
		...database,
		databasePassword: REDACTED,
	} as T;
};
