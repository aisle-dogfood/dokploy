ALTER TABLE "deployment" DROP CONSTRAINT "deployment_rollbackId_rollback_rollbackId_fk";
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_rollbackId_rollback_rollbackId_fk" FOREIGN KEY ("rollbackId") REFERENCES "public"."rollback"("rollbackId") ON DELETE set null ON UPDATE no action;