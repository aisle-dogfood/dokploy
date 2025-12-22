import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { ShowPaidMonitoring } from "../../monitoring/paid/servers/show-paid-monitoring";

interface Props {
	serverId: string;
}

export const ShowMonitoringModal = ({ serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Show Monitoring
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-7xl  ">
				<div className="flex gap-4 py-4 w-full">
					<ShowPaidMonitoring serverId={serverId} />
				</div>
			</DialogContent>
		</Dialog>
	);
};
