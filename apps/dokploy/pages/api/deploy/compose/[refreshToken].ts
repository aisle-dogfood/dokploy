import { db } from "@/server/db";
import { compose } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import {
	getClientIp,
	isRateLimited,
	verifyGiteaSignature,
	verifyGithubSignature,
	verifyGitlabToken,
} from "@/server/utils/webhook-security";
import { IS_CLOUD, shouldDeploy } from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import {
	extractBranchName,
	extractCommitMessage,
	extractCommitedPaths,
	extractHash,
	getProviderByHeader,
} from "../[refreshToken]";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { refreshToken } = req.query;
	try {
		if (req.headers["x-github-event"] === "ping") {
			res.status(200).json({ message: "Ping received, webhook is active" });
			return;
		}

		// Rate limiting check - prevent abuse
		const clientIp = getClientIp(req);
		const rateLimitKey = `compose:${refreshToken}:${clientIp}`;
		if (isRateLimited(rateLimitKey)) {
			res.status(429).json({
				message:
					"Rate limit exceeded. Too many webhook requests. Please try again later.",
			});
			return;
		}

		const composeResult = await db.query.compose.findFirst({
			where: eq(compose.refreshToken, refreshToken as string),
			with: {
				project: true,
				bitbucket: true,
				github: true,
				gitlab: true,
				gitea: true,
			},
		});

		if (!composeResult) {
			res.status(404).json({ message: "Compose Not Found" });
			return;
		}
		if (!composeResult?.autoDeploy) {
			res.status(400).json({
				message: "Automatic deployments are disabled for this compose",
			});
			return;
		}

		// Provider signature verification
		const sourceType = composeResult.sourceType;
		const provider = getProviderByHeader(req.headers);

		// For GitHub webhooks, verify HMAC signature if webhook secret is configured
		if (
			(sourceType === "github" || provider === "github") &&
			composeResult.github?.githubWebhookSecret
		) {
			const signature = req.headers["x-hub-signature-256"] as string;
			const isValid = await verifyGithubSignature(
				JSON.stringify(req.body),
				signature,
				composeResult.github.githubWebhookSecret,
			);

			if (!isValid) {
				console.error(
					`GitHub signature verification failed for compose ${composeResult.composeId}`,
				);
				res.status(401).json({
					message: "Unauthorized: Invalid GitHub webhook signature",
				});
				return;
			}
		}

		// For GitLab webhooks, verify token if configured
		if (
			(sourceType === "gitlab" || provider === "gitlab") &&
			composeResult.gitlab?.secret
		) {
			const token = req.headers["x-gitlab-token"] as string;
			const isValid = verifyGitlabToken(token, composeResult.gitlab.secret);

			if (!isValid) {
				console.error(
					`GitLab token verification failed for compose ${composeResult.composeId}`,
				);
				res.status(401).json({
					message: "Unauthorized: Invalid GitLab webhook token",
				});
				return;
			}
		}

		// For Gitea webhooks, verify HMAC signature if configured
		// Note: Gitea uses client_secret as webhook secret
		if (
			(sourceType === "gitea" || provider === "gitea") &&
			composeResult.gitea?.clientSecret
		) {
			const signature = req.headers["x-gitea-signature"] as string;
			const isValid = verifyGiteaSignature(
				JSON.stringify(req.body),
				signature,
				composeResult.gitea.clientSecret,
			);

			if (!isValid) {
				console.error(
					`Gitea signature verification failed for compose ${composeResult.composeId}`,
				);
				res.status(401).json({
					message: "Unauthorized: Invalid Gitea webhook signature",
				});
				return;
			}
		}

		const deploymentTitle = extractCommitMessage(req.headers, req.body);
		const deploymentHash = extractHash(req.headers, req.body);

		if (sourceType === "github") {
			const branchName = extractBranchName(req.headers, req.body);
			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				composeResult.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			if (!branchName || branchName !== composeResult.branch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		} else if (sourceType === "gitlab") {
			const branchName = extractBranchName(req.headers, req.body);
			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				composeResult.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
			if (!branchName || branchName !== composeResult.gitlabBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		} else if (sourceType === "bitbucket") {
			const branchName = extractBranchName(req.headers, req.body);
			if (!branchName || branchName !== composeResult.bitbucketBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}

			const commitedPaths = await extractCommitedPaths(
				req.body,
				composeResult.bitbucketOwner,
				composeResult.bitbucket?.appPassword || "",
				composeResult.bitbucketRepository || "",
			);

			const shouldDeployPaths = shouldDeploy(
				composeResult.watchPaths,
				commitedPaths,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
		} else if (sourceType === "git") {
			const branchName = extractBranchName(req.headers, req.body);
			if (!branchName || branchName !== composeResult.customGitBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
			const provider = getProviderByHeader(req.headers);
			let normalizedCommits: string[] = [];

			if (provider === "github") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			} else if (provider === "gitlab") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			} else if (provider === "gitea") {
				normalizedCommits = req.body?.commits?.flatMap(
					(commit: any) => commit.modified,
				);
			}

			const shouldDeployPaths = shouldDeploy(
				composeResult.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}
		} else if (sourceType === "gitea") {
			const branchName = extractBranchName(req.headers, req.body);

			const normalizedCommits = req.body?.commits?.flatMap(
				(commit: any) => commit.modified,
			);

			const shouldDeployPaths = shouldDeploy(
				composeResult.watchPaths,
				normalizedCommits,
			);

			if (!shouldDeployPaths) {
				res.status(301).json({ message: "Watch Paths Not Match" });
				return;
			}

			if (!branchName || branchName !== composeResult.giteaBranch) {
				res.status(301).json({ message: "Branch Not Match" });
				return;
			}
		}

		try {
			const jobData: DeploymentJob = {
				composeId: composeResult.composeId as string,
				titleLog: deploymentTitle,
				type: "deploy",
				applicationType: "compose",
				descriptionLog: `Hash: ${deploymentHash}`,
				server: !!composeResult.serverId,
			};

			if (IS_CLOUD && composeResult.serverId) {
				jobData.serverId = composeResult.serverId;
				await deploy(jobData);
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
		} catch (error) {
			res.status(400).json({ message: "Error deploying Compose", error });
			return;
		}

		res.status(200).json({ message: "Compose deployed successfully" });
	} catch (error) {
		console.log(error);
		res.status(400).json({ message: "Error deploying Compose", error });
	}
}
