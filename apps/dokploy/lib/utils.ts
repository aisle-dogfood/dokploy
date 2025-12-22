import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export async function generateSHA256Hash(text: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatTimestamp(timestamp: string | number) {
	try {
		// Si es un string ISO, lo parseamos directamente
		if (typeof timestamp === "string" && timestamp.includes("T")) {
			const date = new Date(timestamp);
			if (!Number.isNaN(date.getTime())) {
				return date.toLocaleString();
			}
		}
		return "Fecha inválida";
	} catch {
		return "Fecha inválida";
	}
}

/**
 * Sanitizes a URL to prevent XSS attacks by ensuring it uses safe protocols.
 * Only allows http and https protocols.
 * @param url - The URL to sanitize
 * @returns The sanitized URL or null if invalid
 */
export function sanitizeUrl(url: string | undefined | null): string | null {
	if (!url || typeof url !== "string") {
		return null;
	}

	try {
		// Trim whitespace
		const trimmedUrl = url.trim();
		
		// Return null for empty strings
		if (!trimmedUrl) {
			return null;
		}

		// Parse the URL
		const parsedUrl = new URL(trimmedUrl);

		// Only allow http and https protocols
		if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
			return parsedUrl.href;
		}

		// Reject all other protocols (javascript:, data:, file:, etc.)
		return null;
	} catch {
		// Invalid URL format
		return null;
	}
}
