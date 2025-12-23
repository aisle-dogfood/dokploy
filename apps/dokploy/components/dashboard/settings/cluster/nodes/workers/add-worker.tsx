import { AlertBlock } from "@/components/shared/alert-block";
import { CardContent } from "@/components/ui/card";
import {
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import copy from "copy-to-clipboard";
import { CopyIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
	serverId?: string;
}

export const AddWorker = ({ serverId }: Props) => {
	const { data, isLoading, error, isError } = api.cluster.addWorker.useQuery({
		serverId,
	});

	return (
		<CardContent className="sm:max-w-4xl   flex flex-col gap-4 px-0">
			<DialogHeader>
				<DialogTitle>Add a new worker</DialogTitle>
				<DialogDescription>Add a new worker</DialogDescription>
			</DialogHeader>
			{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
			{isLoading ? (
				<Loader2 className="w-full animate-spin text-muted-foreground" />
			) : (
				<>
					<AlertBlock type="warning">
						<div className="flex flex-col gap-2">
							<strong>Security Notice:</strong>
							<span>
								Installing Docker via 'curl | sh' can pose security risks. We recommend using your distribution's official package manager with GPG-verified repositories.
							</span>
							<a 
								href="https://docs.docker.com/engine/install/" 
								target="_blank" 
								rel="noopener noreferrer"
								className="text-primary underline"
							>
								See official Docker installation guide →
							</a>
						</div>
					</AlertBlock>

					<div className="flex flex-col gap-2.5 text-sm">
						<span className="font-medium">
							1. Install Docker {data?.version} on your new server
						</span>
						<div className="flex flex-col gap-2">
							<span className="text-muted-foreground">
								Recommended: Use your distribution's package manager
							</span>
							<div className="bg-muted rounded-lg p-3 flex flex-col gap-2">
								<span className="font-mono text-xs">
									# For Ubuntu/Debian:
								</span>
								<span className="bg-background rounded p-2 font-mono text-xs flex justify-between">
									<span>
										curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null && sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io
									</span>
									<button
										type="button"
										className="self-start ml-2"
										onClick={() => {
											copy(
												`curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null && sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io`,
											);
											toast.success("Copied to clipboard");
										}}
									>
										<CopyIcon className="h-4 w-4 cursor-pointer" />
									</button>
								</span>
							</div>
							<span className="text-muted-foreground mt-2">
								Alternative: If you understand the security risks, download and inspect the convenience script first
							</span>
							<div className="bg-muted rounded-lg p-3 flex flex-col gap-2">
								<span className="bg-background rounded p-2 font-mono text-xs flex justify-between">
									<span>
										curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh --version {data?.version}
									</span>
									<button
										type="button"
										className="self-start ml-2"
										onClick={() => {
											copy(
												`curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh --version ${data?.version}`,
											);
											toast.success("Copied to clipboard");
										}}
									>
										<CopyIcon className="h-4 w-4 cursor-pointer" />
									</button>
								</span>
								<span className="text-xs text-muted-foreground">
									This downloads the script first, allowing you to inspect it before execution.
								</span>
							</div>
						</div>
					</div>

					<div className="flex flex-col gap-2.5 text-sm">
						<span>
							2. Run the following command to add the node(worker) to your
							cluster
						</span>

						<span className="bg-muted rounded-lg p-2  flex">
							{data?.command}
							<button
								type="button"
								className="self-start"
								onClick={() => {
									copy(data?.command || "");
									toast.success("Copied to clipboard");
								}}
							>
								<CopyIcon className="h-4 w-4 cursor-pointer" />
							</button>
						</span>
					</div>
				</>
			)}
		</CardContent>
	);
};
