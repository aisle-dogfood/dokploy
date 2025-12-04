import { findGitlabById, updateGitlab } from "@dokploy/server";
import { validateUrlForSSRF } from "@dokploy/server/utils/url-validation";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, gitlabId } = req.query;

	if (!code || Array.isArray(code)) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}

	const gitlab = await findGitlabById(gitlabId as string);

	// Validate the GitLab URL to prevent SSRF attacks
	try {
		await validateUrlForSSRF(gitlab.gitlabUrl);
	} catch (error) {
		return res.status(400).json({
			error: `Invalid GitLab URL: ${error instanceof Error ? error.message : "Unknown error"}`,
		});
	}

	const response = await fetch(`${gitlab.gitlabUrl}/oauth/token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			client_id: gitlab.applicationId as string,
			client_secret: gitlab.secret as string,
			code: code as string,
			grant_type: "authorization_code",
			redirect_uri: `${gitlab.redirectUri}?gitlabId=${gitlabId}`,
		}),
	});

	const result = await response.json();

	if (!result.access_token || !result.refresh_token) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}

	const expiresAt = Math.floor(Date.now() / 1000) + result.expires_in;
	await updateGitlab(gitlab.gitlabId, {
		accessToken: result.access_token,
		refreshToken: result.refresh_token,
		expiresAt,
	});

	return res.redirect(307, "/dashboard/settings/git-providers");
}
