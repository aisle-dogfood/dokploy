import copy from "copy-to-clipboard";
import { Clipboard, EyeIcon, EyeOffIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface SecureUrlInputProps {
	maskedValue: string;
	fullValue: string;
	disabled?: boolean;
}

export const SecureUrlInput = ({ maskedValue, fullValue, disabled }: SecureUrlInputProps) => {
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const togglePasswordVisibility = () => {
		setIsPasswordVisible((prevVisibility) => !prevVisibility);
	};

	const displayValue = isPasswordVisible ? fullValue : maskedValue;
	const inputType = isPasswordVisible ? "text" : "password";

	return (
		<div className="flex w-full items-center space-x-2">
			<Input ref={inputRef} type={inputType} value={displayValue} disabled={disabled} readOnly />
			<Button
				variant={"secondary"}
				onClick={() => {
					copy(fullValue);
					toast.success("Connection URL copied to clipboard");
				}}
			>
				<Clipboard className="size-4 text-muted-foreground" />
			</Button>
			<Button onClick={togglePasswordVisibility} variant={"secondary"}>
				{inputType === "password" ? (
					<EyeIcon className="size-4 text-muted-foreground" />
				) : (
					<EyeOffIcon className="size-4 text-muted-foreground" />
				)}
			</Button>
		</div>
	);
};
