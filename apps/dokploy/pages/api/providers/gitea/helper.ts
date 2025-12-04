import { findGiteaById } from "@dokploy/server";
import type { NextApiResponse } from "next";

export interface Gitea {
	giteaId: string;
	gitProviderId: string;
	redirectUri: string | null;
	accessToken: string | null;
	refreshToken: string | null;
	expiresAt: number | null;
	giteaUrl: string;
	clientId: string | null;
	clientSecret: string | null;
	organizationName?: string;
	gitProvider: {
		name: string;
		gitProviderId: string;
		providerType: "github" | "gitlab" | "bitbucket" | "gitea";
		createdAt: string;
		organizationId: string;
	};
}

export const findGitea = async (giteaId: string): Promise<Gitea | null> => {
	try {
		const gitea = await findGiteaById(giteaId);
		return gitea;
	} catch (findError) {
		console.error("Error finding Gitea provider:", findError);
		return null;
	}
};

export const redirectWithError = (res: NextApiResponse, error: string) => {
	return res.redirect(
		307,
		`/dashboard/settings/git-providers?error=${encodeURIComponent(error)}`,
	);
};

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF) attacks.
 * Checks for private IP ranges, localhost, and other potentially dangerous targets.
 * 
 * @param urlString - The URL to validate
 * @returns true if the URL is safe to use, false otherwise
 */
export const isUrlSafeFromSSRF = (urlString: string): boolean => {
	try {
		const url = new URL(urlString);

		// Only allow HTTP and HTTPS protocols
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return false;
		}

		const hostname = url.hostname.toLowerCase();

		// Block localhost and loopback addresses
		if (
			hostname === "localhost" ||
			hostname === "0.0.0.0" ||
			hostname.startsWith("127.") ||
			hostname === "::1" ||
			hostname === "::" ||
			hostname === "0000:0000:0000:0000:0000:0000:0000:0001"
		) {
			return false;
		}

		// Block link-local addresses (AWS metadata service, etc.)
		if (hostname.startsWith("169.254.") || hostname.startsWith("fe80:")) {
			return false;
		}

		// IPv4 private ranges check
		const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
		const ipv4Match = hostname.match(ipv4Regex);
		
		if (ipv4Match) {
			const octets = ipv4Match.slice(1, 5).map(Number);
			
			// Validate each octet is in range 0-255
			if (octets.some((octet) => octet < 0 || octet > 255)) {
				return false;
			}

			// Block private IP ranges
			// 10.0.0.0/8
			if (octets[0] === 10) {
				return false;
			}
			// 172.16.0.0/12
			if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
				return false;
			}
			// 192.168.0.0/16
			if (octets[0] === 192 && octets[1] === 168) {
				return false;
			}
		}

		// Block IPv6 private addresses (simplified check for common patterns)
		if (hostname.includes(":")) {
			const lowerHostname = hostname.toLowerCase();
			// Block unique local addresses (fc00::/7)
			if (lowerHostname.startsWith("fc") || lowerHostname.startsWith("fd")) {
				return false;
			}
		}

		return true;
	} catch {
		// If URL parsing fails, consider it unsafe
		return false;
	}
};
