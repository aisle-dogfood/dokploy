-- Migrate time fields from TEXT to TIMESTAMPTZ
-- This migration converts all time-related fields (createdAt, updatedAt, startedAt, finishedAt, lastUsedAt, expiresAt)
-- from TEXT type to TIMESTAMPTZ for proper time handling, ordering, and TTL semantics

-- Application table
ALTER TABLE "application" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Deployment table
ALTER TABLE "deployment" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "deployment" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "deployment" ALTER COLUMN "startedAt" TYPE timestamptz USING "startedAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "deployment" ALTER COLUMN "finishedAt" TYPE timestamptz USING "finishedAt"::timestamptz;--> statement-breakpoint

-- Domain table
ALTER TABLE "domain" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "domain" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- SSH Key table
ALTER TABLE "ssh-key" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "ssh-key" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ssh-key" ALTER COLUMN "lastUsedAt" TYPE timestamptz USING "lastUsedAt"::timestamptz;--> statement-breakpoint

-- Postgres table
ALTER TABLE "postgres" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "postgres" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Notification table
ALTER TABLE "notification" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Compose table
ALTER TABLE "compose" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "compose" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Git Provider table
ALTER TABLE "git_provider" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "git_provider" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Rollback table
ALTER TABLE "rollback" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "rollback" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Volume Backup table
ALTER TABLE "volume_backup" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "volume_backup" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Registry table
ALTER TABLE "registry" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "registry" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Security table
ALTER TABLE "security" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "security" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Server table
ALTER TABLE "server" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Redis table
ALTER TABLE "redis" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "redis" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Preview Deployments table
ALTER TABLE "preview_deployments" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "preview_deployments" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "preview_deployments" ALTER COLUMN "expiresAt" TYPE timestamptz USING "expiresAt"::timestamptz;--> statement-breakpoint

-- MariaDB table
ALTER TABLE "mariadb" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "mariadb" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- MySQL table
ALTER TABLE "mysql" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "mysql" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Mongo table
ALTER TABLE "mongo" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "mongo" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Schedule table
ALTER TABLE "schedule" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "schedule" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Redirect table
ALTER TABLE "redirect" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "redirect" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- Project table
ALTER TABLE "project" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- AI table
ALTER TABLE "ai" ALTER COLUMN "createdAt" TYPE timestamptz USING "createdAt"::timestamptz;--> statement-breakpoint
ALTER TABLE "ai" ALTER COLUMN "createdAt" SET DEFAULT now();
