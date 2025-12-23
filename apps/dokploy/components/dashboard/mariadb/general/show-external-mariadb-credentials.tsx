import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { Clipboard } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const DockerProviderSchema = z.object({
	externalPort: z.preprocess((a) => {
		if (a !== null) {
			const parsed = Number.parseInt(z.string().parse(a), 10);
			return Number.isNaN(parsed) ? null : parsed;
		}
		return null;
	}, z
		.number()
		.gte(0, "Range must be 0 - 65535")
		.lte(65535, "Range must be 0 - 65535")
		.nullable()),
});

type DockerProvider = z.infer<typeof DockerProviderSchema>;

interface Props {
	mariadbId: string;
}
export const ShowExternalMariadbCredentials = ({ mariadbId }: Props) => {
	const { data: ip } = api.settings.getIp.useQuery();
	const { data, refetch } = api.mariadb.one.useQuery({ mariadbId });
	const { mutateAsync, isLoading } = api.mariadb.saveExternalPort.useMutation();
	const [connectionUrl, setConnectionUrl] = useState("");
	const getIp = data?.server?.ipAddress || ip;
	const form = useForm<DockerProvider>({
		defaultValues: {},
		resolver: zodResolver(DockerProviderSchema),
	});

	useEffect(() => {
		if (data?.externalPort) {
			form.reset({
				externalPort: data.externalPort,
			});
		}
	}, [form.reset, data, form]);

	const onSubmit = async (values: DockerProvider) => {
		await mutateAsync({
			externalPort: values.externalPort,
			mariadbId,
		})
			.then(async () => {
				toast.success("External Port updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error saving the external port");
			});
	};

	useEffect(() => {
		const buildMaskedConnectionUrl = () => {
			const port = form.watch("externalPort") || data?.externalPort;

			return `mariadb://${data?.databaseUser}:****@${getIp}:${port}/${data?.databaseName}`;
		};

		setConnectionUrl(buildMaskedConnectionUrl());
	}, [
		data?.appName,
		data?.externalPort,
		form,
		data?.databaseName,
		data?.databaseUser,
		getIp,
	]);

	const copyConnectionUrl = () => {
		const port = form.watch("externalPort") || data?.externalPort;
		const fullUrl = `mariadb://${data?.databaseUser}:${data?.databasePassword}@${getIp}:${port}/${data?.databaseName}`;
		copy(fullUrl);
		toast.success("Connection URL copied to clipboard");
	};
	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">External Credentials</CardTitle>
						<CardDescription>
							In order to make the database reachable trought internet is
							required to set a port, make sure the port is not used by another
							application or database
						</CardDescription>
					</CardHeader>
					<CardContent className="flex w-full flex-col gap-4">
						{!getIp && (
							<AlertBlock type="warning">
								You need to set an IP address in your{" "}
								<Link
									href="/dashboard/settings/server"
									className="text-primary"
								>
									{data?.serverId
										? "Remote Servers -> Server -> Edit Server -> Update IP Address"
										: "Web Server -> Server -> Update Server IP"}
								</Link>{" "}
								to fix the database url connection.
							</AlertBlock>
						)}
						<Form {...form}>
							<form
								onSubmit={form.handleSubmit(onSubmit)}
								className="flex flex-col gap-4"
							>
								<div className="grid md:grid-cols-2 gap-4 ">
									<div className="md:col-span-2 space-y-4">
										<FormField
											control={form.control}
											name="externalPort"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>External Port (Internet)</FormLabel>
														<FormControl>
															<Input
																placeholder="3306"
																{...field}
																value={field.value || ""}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												);
											}}
										/>
									</div>
								</div>
								{!!data?.externalPort && (
									<div className="grid w-full gap-8">
										<div className="flex flex-col gap-3">
											{/* jdbc:mariadb://5.161.59.207:3306/pixel-calculate?user=mariadb&password=HdVXfq6hM7W7F1 */}
											<Label>External Host</Label>
											<div className="flex w-full items-center space-x-2">
												<Input value={connectionUrl} disabled />
												<Button
													type="button"
													variant={"secondary"}
													onClick={copyConnectionUrl}
												>
													<Clipboard className="size-4 text-muted-foreground" />
												</Button>
											</div>
										</div>
									</div>
								)}

								<div className="flex justify-end">
									<Button type="submit" isLoading={isLoading}>
										Save
									</Button>
								</div>
							</form>
						</Form>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
