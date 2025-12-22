-- Fix mutual ON DELETE CASCADE between deployment and rollback
-- Make rollback.deploymentId nullable
ALTER TABLE "rollback" ALTER COLUMN "deploymentId" DROP NOT NULL;
--> statement-breakpoint
-- Change rollback.deploymentId foreign key from CASCADE to SET NULL
ALTER TABLE "rollback" DROP CONSTRAINT "rollback_deploymentId_deployment_deploymentId_fk";
--> statement-breakpoint
ALTER TABLE "rollback" ADD CONSTRAINT "rollback_deploymentId_deployment_deploymentId_fk" FOREIGN KEY ("deploymentId") REFERENCES "public"."deployment"("deploymentId") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Change deployment.rollbackId foreign key from CASCADE to SET NULL
ALTER TABLE "deployment" DROP CONSTRAINT "deployment_rollbackId_rollback_rollbackId_fk";
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_rollbackId_rollback_rollbackId_fk" FOREIGN KEY ("rollbackId") REFERENCES "public"."rollback"("rollbackId") ON DELETE set null ON UPDATE no action;
