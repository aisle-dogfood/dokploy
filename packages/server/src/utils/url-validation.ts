import { lookup } from "node:dns/promises";
import { URL } from "node:url";

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF) attacks
 * @param urlString The URL string to validate
 * @throws Error if the URL is invalid or points to a private/internal resource
 */
export async function validateUrlForSSRF(urlString: string): Promise<void> {
	let parsedUrl: URL;

	// Parse the URL
	try {
		parsedUrl = new URL(urlString);
	} catch (error) {
		throw new Error("Invalid URL format");
	}

	// Only allow http and https protocols
	if (!["http:", "https:"].includes(parsedUrl.protocol)) {
		throw new Error(
			`Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed`,
		);
	}

	const hostname = parsedUrl.hostname.toLowerCase();

	// Block localhost and loopback addresses
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname.startsWith("127.") ||
		hostname === "0.0.0.0" ||
		hostname === "::"
	) {
		throw new Error("Access to localhost is not allowed");
	}

	// Resolve hostname to IP address(es)
	let addresses: string[];
	try {
		const result = await lookup(hostname, { all: true });
		addresses = result.map((addr) => addr.address);
	} catch (error) {
		throw new Error(`Unable to resolve hostname: ${hostname}`);
	}

	// Check each resolved IP address
	for (const address of addresses) {
		if (isPrivateOrReservedIP(address)) {
			throw new Error(
				`Access to private or reserved IP addresses is not allowed: ${address}`,
			);
		}
	}
}

/**
 * Checks if an IP address is private, reserved, or otherwise restricted
 * @param ip IP address to check (IPv4 or IPv6)
 * @returns true if the IP is private/reserved, false otherwise
 */
function isPrivateOrReservedIP(ip: string): boolean {
	// Check for IPv6
	if (ip.includes(":")) {
		return isPrivateIPv6(ip);
	}

	// Check for IPv4
	const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
	if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
		return true; // Invalid IP, treat as restricted
	}

	const [first, second] = parts;

	// Loopback: 127.0.0.0/8
	if (first === 127) {
		return true;
	}

	// Private networks
	// 10.0.0.0/8
	if (first === 10) {
		return true;
	}

	// 172.16.0.0/12
	if (first === 172 && second >= 16 && second <= 31) {
		return true;
	}

	// 192.168.0.0/16
	if (first === 192 && second === 168) {
		return true;
	}

	// Link-local: 169.254.0.0/16
	if (first === 169 && second === 254) {
		return true;
	}

	// Broadcast: 255.255.255.255
	if (first === 255 && second === 255 && parts[2] === 255 && parts[3] === 255) {
		return true;
	}

	// Current network: 0.0.0.0/8
	if (first === 0) {
		return true;
	}

	// Multicast: 224.0.0.0/4
	if (first >= 224 && first <= 239) {
		return true;
	}

	// Reserved: 240.0.0.0/4
	if (first >= 240) {
		return true;
	}

	return false;
}

/**
 * Checks if an IPv6 address is private or reserved
 * @param ip IPv6 address to check
 * @returns true if the IP is private/reserved, false otherwise
 */
function isPrivateIPv6(ip: string): boolean {
	const normalized = ip.toLowerCase();

	// Loopback: ::1
	if (normalized === "::1") {
		return true;
	}

	// Unspecified: ::
	if (normalized === "::") {
		return true;
	}

	// Link-local: fe80::/10
	if (normalized.startsWith("fe80:")) {
		return true;
	}

	// Unique local: fc00::/7
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
		return true;
	}

	// IPv4-mapped IPv6: ::ffff:0:0/96
	if (normalized.includes("::ffff:")) {
		return true;
	}

	return false;
}
