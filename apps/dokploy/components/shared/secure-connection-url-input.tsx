import copy from "copy-to-clipboard";
import { Clipboard, EyeIcon, EyeOffIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input, type InputProps } from "../ui/input";

interface SecureConnectionUrlInputProps extends Omit<InputProps, 'value'> {
	maskedValue: string;
	actualValue: string;
}

export const SecureConnectionUrlInput = ({ maskedValue, actualValue, ...props }: SecureConnectionUrlInputProps) => {
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const togglePasswordVisibility = () => {
		setIsPasswordVisible((prevVisibility) => !prevVisibility);
	};

	const inputType = isPasswordVisible ? "text" : "password";
	
	return (
		<div className="flex w-full items-center space-x-2">
			<Input 
				ref={inputRef} 
				type={inputType} 
				value={maskedValue}
				{...props} 
			/>
			<Button
				variant={"secondary"}
				onClick={() => {
					copy(actualValue);
					toast.success("Connection URL copied to clipboard");
				}}
				type="button"
			>
				<Clipboard className="size-4 text-muted-foreground" />
			</Button>
			<Button onClick={togglePasswordVisibility} variant={"secondary"} type="button">
				{inputType === "password" ? (
					<EyeIcon className="size-4 text-muted-foreground" />
				) : (
					<EyeOffIcon className="size-4 text-muted-foreground" />
				)}
			</Button>
		</div>
	);
};
