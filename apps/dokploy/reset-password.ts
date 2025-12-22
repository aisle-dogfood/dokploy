import { findAdmin } from "@dokploy/server";
import { generateRandomPassword } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { account } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

(async () => {
	try {
		const randomPassword = await generateRandomPassword();

		const result = await findAdmin();

		const update = await db
			.update(account)
			.set({
				password: randomPassword.hashedPassword,
			})
			.where(eq(account.userId, result.userId));

		if (update) {
			console.log("Password reset successful");
			
			// Write password to a secure temporary file instead of stdout
			const tempFilePath = join(tmpdir(), `dokploy-reset-${Date.now()}.txt`);
			const fileContent = `DOKPLOY ADMIN PASSWORD RESET
================================
New password: ${randomPassword.randomPassword}

IMPORTANT SECURITY NOTICE:
- Copy this password immediately
- Delete this file after use: rm ${tempFilePath}
- Change this password after first login
- Do not share this file or leave it on the system
================================
`;
			
			writeFileSync(tempFilePath, fileContent, { mode: 0o600 });
			// Explicitly set file permissions to be readable only by owner
			chmodSync(tempFilePath, 0o600);
			
			console.log("Password has been written to a secure temporary file:");
			console.log(tempFilePath);
			console.log("\nFor security reasons, the password is not displayed in the console.");
			console.log("Please read the file, copy the password, and delete the file immediately.");
		} else {
			console.log("Password reset failed");
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting password", error);
	}
})();
