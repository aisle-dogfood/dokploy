import { adminClient } from "better-auth/client";
import { apiKeyClient } from "better-auth/client";
import { organizationClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// baseURL: "http://localhost:3000", // the base url of your auth server
	plugins: [
		organizationClient(),
		twoFactorClient(),
		apiKeyClient(),
		adminClient(),
	],
});
