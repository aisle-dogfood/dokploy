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
	const { code, state, installation_id, userId }: Query = req.query as Query;

	if (!code || Array.isArray(code)) {
		return res.status(400).json({ error: "Missing or invalid code parameter" });
	}

	if (!state || Array.isArray(state)) {
		return res.status(400).json({ error: "Missing or invalid state parameter" });
	}

	const stateParts = state.split(":");
	if (stateParts.length !== 2) {
		return res.status(400).json({ error: "Invalid state format" });
	}

	const [action, value] = stateParts;
	// Value could be the organizationId or the githubProviderId

	if (!action || !value) {
		return res.status(400).json({ error: "Invalid state format" });
	}

	if (action === "gh_init") {
		if (!userId || Array.isArray(userId)) {
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
		if (!installation_id || Array.isArray(installation_id)) {
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
		return res.status(400).json({ error: "Invalid action in state parameter" });
	}

	res.redirect(307, "/dashboard/settings/git-providers");
}
