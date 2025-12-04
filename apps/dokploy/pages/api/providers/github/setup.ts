import { db } from "@/server/db";
import { github } from "@/server/db/schema";
import { createGithub } from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "octokit";

type Query = {
	code: string;
	state: string;
	installation_id: string;
	setup_action: string;
	userId: string;
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, state, installation_id, userId } = req.query;

	if (!code || typeof code !== "string") {
		return res.status(400).json({ error: "Missing or invalid code parameter" });
	}

	if (!state || typeof state !== "string") {
		return res.status(400).json({ error: "Missing or invalid state parameter" });
	}

	const splitState = state.split(":");
	if (splitState.length !== 2) {
		return res.status(400).json({ error: "Invalid state format" });
	}

	const [action, value] = splitState;
	// Value could be the organizationId or the githubProviderId

	if (!action || !value) {
		return res.status(400).json({ error: "Invalid state parameter" });
	}

	if (action === "gh_init") {
		if (!userId || typeof userId !== "string") {
			return res.status(400).json({ error: "Missing or invalid userId parameter" });
		}

		const octokit = new Octokit({});
		const { data } = await octokit.request(
			"POST /app-manifests/{code}/conversions",
			{
				code: code,
			},
		);

		await createGithub(
			{
				name: data.name,
				githubAppName: data.html_url,
				githubAppId: data.id,
				githubClientId: data.client_id,
				githubClientSecret: data.client_secret,
				githubWebhookSecret: data.webhook_secret,
				githubPrivateKey: data.pem,
			},
			value,
			userId,
		);
	} else if (action === "gh_setup") {
		if (!installation_id || typeof installation_id !== "string") {
			return res.status(400).json({ error: "Missing or invalid installation_id parameter" });
		}

		await db
			.update(github)
			.set({
				githubInstallationId: installation_id,
			})
			.where(eq(github.githubId, value))
			.returning();
	} else {
		return res.status(400).json({ error: "Invalid action parameter" });
	}

	res.redirect(307, "/dashboard/settings/git-providers");
}
