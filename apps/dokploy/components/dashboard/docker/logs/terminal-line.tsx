import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipPortal,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FancyAnsi } from "fancy-ansi";
import { escapeRegExp } from "lodash";
import { type CSSProperties, type ReactNode, useMemo } from "react";
import { type LogLine, getLogType } from "./utils";

interface LogLineProps {
	log: LogLine;
	noTimestamp?: boolean;
	searchTerm?: string;
}

const fancyAnsi = new FancyAnsi();
const highlightClassName =
	"bg-orange-200/80 dark:bg-orange-900/80 font-bold";

/**
 * Copies only the ANSI formatting properties that are expected for log output.
 * Any other inline styles are discarded before the content is rendered.
 */
const getSafeAnsiStyles = (element: HTMLElement): CSSProperties | undefined => {
	const safeStyles: CSSProperties = {};

	if (element.style.color) {
		safeStyles.color = element.style.color;
	}
	if (element.style.backgroundColor) {
		safeStyles.backgroundColor = element.style.backgroundColor;
	}
	if (element.style.fontWeight) {
		safeStyles.fontWeight = element.style.fontWeight;
	}
	if (element.style.fontStyle) {
		safeStyles.fontStyle = element.style.fontStyle;
	}
	if (element.style.textDecoration) {
		safeStyles.textDecoration = element.style.textDecoration;
	}
	if (element.style.opacity) {
		safeStyles.opacity = element.style.opacity;
	}

	return Object.keys(safeStyles).length > 0 ? safeStyles : undefined;
};

/**
 * Highlights case-insensitive search matches inside plain text segments without
 * introducing any HTML parsing or string-based markup rewriting.
 */
const highlightText = (text: string, term: string, keyPrefix: string): ReactNode => {
	if (!term) {
		return text;
	}

	const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, "gi"));

	return parts.map((part, index) =>
		index % 2 === 1 ? (
			<span key={`${keyPrefix}-${index}`} className={highlightClassName}>
				{part}
			</span>
		) : (
			part
		),
	);
};

/**
 * Rebuilds parsed ANSI HTML as React nodes while allowing only safe elements
 * and routing every text node through the highlighter.
 */
const renderAnsiNode = (node: ChildNode, term: string, key: string): ReactNode => {
	if (node.nodeType === 3) {
		return highlightText(node.textContent ?? "", term, key);
	}

	if (node.nodeType !== 1) {
		return null;
	}

	const element = node as HTMLElement;

	if (element.tagName === "BR") {
		return <br key={key} />;
	}

	if (element.tagName !== "SPAN") {
		return highlightText(element.textContent ?? "", term, key);
	}

	const children = Array.from(element.childNodes).map((childNode, index) =>
		renderAnsiNode(childNode, term, `${key}-${index}`),
	);

	return (
		<span key={key} style={getSafeAnsiStyles(element)}>
			{children}
		</span>
	);
};

/**
 * Converts ANSI output into a detached DOM tree and renders it back as safe
 * React content, falling back to plain highlighted text when DOM parsing is
 * unavailable.
 */
const renderAnsiMessage = (text: string, term: string): ReactNode => {
	if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
		return highlightText(text, term, "plain");
	}

	const parser = new window.DOMParser();
	const document = parser.parseFromString(
		`<div>${fancyAnsi.toHtml(text)}</div>`,
		"text/html",
	);
	const root = document.body.firstElementChild;

	if (!root) {
		return highlightText(text, term, "plain");
	}

	return Array.from(root.childNodes).map((childNode, index) =>
		renderAnsiNode(childNode, term, `ansi-${index}`),
	);
};

export function TerminalLine({ log, noTimestamp, searchTerm }: LogLineProps) {
	const { timestamp, message, rawTimestamp } = log;
	const { type, variant, color } = getLogType(message);

	const formattedTime = timestamp
		? timestamp.toLocaleString([], {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				year: "2-digit",
				second: "2-digit",
			})
		: "--- No time found ---";

	const renderedMessage = useMemo(
		() => renderAnsiMessage(message, searchTerm || ""),
		[message, searchTerm],
	);

	const tooltip = (color: string, timestamp: string | null) => {
		const square = (
			<div className={cn("w-2 h-full flex-shrink-0 rounded-[3px]", color)} />
		);
		return timestamp ? (
			<TooltipProvider delayDuration={0} disableHoverableContent>
				<Tooltip>
					<TooltipTrigger asChild>{square}</TooltipTrigger>
					<TooltipPortal>
						<TooltipContent
							sideOffset={5}
							className="bg-popover border-border z-[99999]"
						>
							<p className="text text-xs text-muted-foreground break-all max-w-md">
								<pre>{timestamp}</pre>
							</p>
						</TooltipContent>
					</TooltipPortal>
				</Tooltip>
			</TooltipProvider>
		) : (
			square
		);
	};

	return (
		<div
			className={cn(
				"font-mono text-xs flex flex-row gap-3 py-2 sm:py-0.5 group",
				type === "error"
					? "bg-red-500/10 hover:bg-red-500/15"
					: type === "warning"
						? "bg-yellow-500/10 hover:bg-yellow-500/15"
						: type === "debug"
							? "bg-orange-500/10 hover:bg-orange-500/15"
							: "hover:bg-gray-200/50 dark:hover:bg-gray-800/50",
			)}
		>
			{" "}
			<div className="flex items-start gap-x-2">
				{/* Icon to expand the log item maybe implement a colapsible later */}
				{/* <Square className="size-4 text-muted-foreground opacity-0 group-hover/logitem:opacity-100 transition-opacity" /> */}
				{tooltip(color, rawTimestamp)}
				{!noTimestamp && (
					<span className="select-none pl-2 text-muted-foreground w-full sm:w-40 flex-shrink-0">
						{formattedTime}
					</span>
				)}

				<Badge
					variant={variant}
					className="w-14 justify-center text-[10px] px-1 py-0"
				>
					{type}
				</Badge>
			</div>
			<span className="dark:text-gray-200 font-mono text-foreground whitespace-pre-wrap break-all transition-colors">
				{renderedMessage}
			</span>
		</div>
	);
}
