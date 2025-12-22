-- Enable Row-Level Security on all tables for multi-tenant isolation
-- This migration addresses the security vulnerability where all tables had isRLSEnabled=false

-- Helper function to get current user's organization IDs from session variable
CREATE OR REPLACE FUNCTION get_current_user_organizations()
RETURNS TEXT[] AS $$
BEGIN
  -- Returns array of organization IDs the current user has access to
  -- Format: 'org_id1,org_id2,org_id3'
  RETURN string_to_array(
    COALESCE(current_setting('app.current_user_organizations', TRUE), ''),
    ','
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN ARRAY[]::TEXT[];
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper function to check if user has access to an organization
CREATE OR REPLACE FUNCTION has_organization_access(org_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN org_id = ANY(get_current_user_organizations());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==========================================
-- Tables with direct organizationId
-- ==========================================

-- Enable RLS on organization table
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_access ON "organization"
  FOR ALL
  USING (has_organization_access(id));

-- Enable RLS on server table
ALTER TABLE "server" ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_access ON "server"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on project table
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_access ON "project"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on member table
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_access ON "member"
  FOR ALL
  USING (has_organization_access("organization_id"));

-- Enable RLS on invitation table
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_access ON "invitation"
  FOR ALL
  USING (has_organization_access("organization_id"));

-- Enable RLS on ai table
ALTER TABLE "ai" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_access ON "ai"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on certificate table
ALTER TABLE "certificate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY certificate_access ON "certificate"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on destination table
ALTER TABLE "destination" ENABLE ROW LEVEL SECURITY;
CREATE POLICY destination_access ON "destination"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on git_provider table
ALTER TABLE "git_provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY git_provider_access ON "git_provider"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on registry table
ALTER TABLE "registry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY registry_access ON "registry"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on ssh_key table
ALTER TABLE "ssh_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssh_key_access ON "ssh_key"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- Enable RLS on notification table
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_access ON "notification"
  FOR ALL
  USING (has_organization_access("organizationId"));

-- ==========================================
-- Tables with projectId (inherit through project)
-- ==========================================

-- Enable RLS on application table
ALTER TABLE "application" ENABLE ROW LEVEL SECURITY;
CREATE POLICY application_access ON "application"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "application"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on compose table
ALTER TABLE "compose" ENABLE ROW LEVEL SECURITY;
CREATE POLICY compose_access ON "compose"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "compose"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on mysql table
ALTER TABLE "mysql" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mysql_access ON "mysql"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "mysql"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on postgres table
ALTER TABLE "postgres" ENABLE ROW LEVEL SECURITY;
CREATE POLICY postgres_access ON "postgres"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "postgres"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on mariadb table
ALTER TABLE "mariadb" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mariadb_access ON "mariadb"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "mariadb"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on mongo table
ALTER TABLE "mongo" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mongo_access ON "mongo"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "mongo"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on redis table
ALTER TABLE "redis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY redis_access ON "redis"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "project"
      WHERE "project"."projectId" = "redis"."projectId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- ==========================================
-- Tables with applicationId/composeId (inherit through app/compose -> project)
-- ==========================================

-- Enable RLS on domain table
ALTER TABLE "domain" ENABLE ROW LEVEL SECURITY;
CREATE POLICY domain_access ON "domain"
  FOR ALL
  USING (
    ("applicationId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "domain"."applicationId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("composeId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "compose"
      INNER JOIN "project" ON "project"."projectId" = "compose"."projectId"
      WHERE "compose"."composeId" = "domain"."composeId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("previewDeploymentId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "preview_deployments" pd
      INNER JOIN "application" ON "application"."applicationId" = pd."applicationId"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE pd."previewDeploymentId" = "domain"."previewDeploymentId"
        AND has_organization_access("project"."organizationId")
    ))
  );

-- Enable RLS on deployment table
ALTER TABLE "deployment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY deployment_access ON "deployment"
  FOR ALL
  USING (
    ("applicationId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "deployment"."applicationId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("composeId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "compose"
      INNER JOIN "project" ON "project"."projectId" = "compose"."projectId"
      WHERE "compose"."composeId" = "deployment"."composeId"
        AND has_organization_access("project"."organizationId")
    ))
  );

-- Enable RLS on mount table
ALTER TABLE "mount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mount_access ON "mount"
  FOR ALL
  USING (
    ("applicationId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "mount"."applicationId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("composeId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "compose"
      INNER JOIN "project" ON "project"."projectId" = "compose"."projectId"
      WHERE "compose"."composeId" = "mount"."composeId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("postgresId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "postgres"
      INNER JOIN "project" ON "project"."projectId" = "postgres"."projectId"
      WHERE "postgres"."postgresId" = "mount"."postgresId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mariadbId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mariadb"
      INNER JOIN "project" ON "project"."projectId" = "mariadb"."projectId"
      WHERE "mariadb"."mariadbId" = "mount"."mariadbId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mongoId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mongo"
      INNER JOIN "project" ON "project"."projectId" = "mongo"."projectId"
      WHERE "mongo"."mongoId" = "mount"."mongoId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mysqlId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mysql"
      INNER JOIN "project" ON "project"."projectId" = "mysql"."projectId"
      WHERE "mysql"."mysqlId" = "mount"."mysqlId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("redisId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "redis"
      INNER JOIN "project" ON "project"."projectId" = "redis"."projectId"
      WHERE "redis"."redisId" = "mount"."redisId"
        AND has_organization_access("project"."organizationId")
    ))
  );

-- Enable RLS on redirects table
ALTER TABLE "redirects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY redirects_access ON "redirects"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "redirects"."applicationId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on security table
ALTER TABLE "security" ENABLE ROW LEVEL SECURITY;
CREATE POLICY security_access ON "security"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "security"."applicationId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on port table
ALTER TABLE "port" ENABLE ROW LEVEL SECURITY;
CREATE POLICY port_access ON "port"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "port"."applicationId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- Enable RLS on preview_deployments table
ALTER TABLE "preview_deployments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY preview_deployments_access ON "preview_deployments"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "preview_deployments"."applicationId"
        AND has_organization_access("project"."organizationId")
    )
  );

-- ==========================================
-- Backup related tables
-- ==========================================

-- Enable RLS on backups table
ALTER TABLE "backups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY backups_access ON "backups"
  FOR ALL
  USING (
    ("postgresId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "postgres"
      INNER JOIN "project" ON "project"."projectId" = "postgres"."projectId"
      WHERE "postgres"."postgresId" = "backups"."postgresId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mariadbId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mariadb"
      INNER JOIN "project" ON "project"."projectId" = "mariadb"."projectId"
      WHERE "mariadb"."mariadbId" = "backups"."mariadbId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mysqlId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mysql"
      INNER JOIN "project" ON "project"."projectId" = "mysql"."projectId"
      WHERE "mysql"."mysqlId" = "backups"."mysqlId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mongoId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mongo"
      INNER JOIN "project" ON "project"."projectId" = "mongo"."projectId"
      WHERE "mongo"."mongoId" = "backups"."mongoId"
        AND has_organization_access("project"."organizationId")
    ))
  );

-- Enable RLS on volume_backups table
ALTER TABLE "volume_backups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY volume_backups_access ON "volume_backups"
  FOR ALL
  USING (
    ("applicationId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "volume_backups"."applicationId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("postgresId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "postgres"
      INNER JOIN "project" ON "project"."projectId" = "postgres"."projectId"
      WHERE "postgres"."postgresId" = "volume_backups"."postgresId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mariadbId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mariadb"
      INNER JOIN "project" ON "project"."projectId" = "mariadb"."projectId"
      WHERE "mariadb"."mariadbId" = "volume_backups"."mariadbId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mysqlId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mysql"
      INNER JOIN "project" ON "project"."projectId" = "mysql"."projectId"
      WHERE "mysql"."mysqlId" = "volume_backups"."mysqlId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("mongoId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "mongo"
      INNER JOIN "project" ON "project"."projectId" = "mongo"."projectId"
      WHERE "mongo"."mongoId" = "volume_backups"."mongoId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("composeId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "compose"
      INNER JOIN "project" ON "project"."projectId" = "compose"."projectId"
      WHERE "compose"."composeId" = "volume_backups"."composeId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("redisId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "redis"
      INNER JOIN "project" ON "project"."projectId" = "redis"."projectId"
      WHERE "redis"."redisId" = "volume_backups"."redisId"
        AND has_organization_access("project"."organizationId")
    ))
  );

-- ==========================================
-- Git provider tables
-- ==========================================

-- Enable RLS on github table
ALTER TABLE "github" ENABLE ROW LEVEL SECURITY;
CREATE POLICY github_access ON "github"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "git_provider"
      WHERE "git_provider"."githubId" = "github"."githubId"
        AND has_organization_access("git_provider"."organizationId")
    )
  );

-- Enable RLS on gitlab table
ALTER TABLE "gitlab" ENABLE ROW LEVEL SECURITY;
CREATE POLICY gitlab_access ON "gitlab"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "git_provider"
      WHERE "git_provider"."gitlabId" = "gitlab"."gitlabId"
        AND has_organization_access("git_provider"."organizationId")
    )
  );

-- Enable RLS on bitbucket table
ALTER TABLE "bitbucket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bitbucket_access ON "bitbucket"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "git_provider"
      WHERE "git_provider"."bitbucketId" = "bitbucket"."bitbucketId"
        AND has_organization_access("git_provider"."organizationId")
    )
  );

-- Enable RLS on gitea table
ALTER TABLE "gitea" ENABLE ROW LEVEL SECURITY;
CREATE POLICY gitea_access ON "gitea"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "git_provider"
      WHERE "git_provider"."giteaId" = "gitea"."giteaId"
        AND has_organization_access("git_provider"."organizationId")
    )
  );

-- ==========================================
-- Notification provider tables
-- ==========================================

-- Enable RLS on slack table
ALTER TABLE "slack" ENABLE ROW LEVEL SECURITY;
CREATE POLICY slack_access ON "slack"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "notification"
      WHERE "notification"."slackId" = "slack"."slackId"
        AND has_organization_access("notification"."organizationId")
    )
  );

-- Enable RLS on telegram table
ALTER TABLE "telegram" ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_access ON "telegram"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "notification"
      WHERE "notification"."telegramId" = "telegram"."telegramId"
        AND has_organization_access("notification"."organizationId")
    )
  );

-- Enable RLS on discord table
ALTER TABLE "discord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY discord_access ON "discord"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "notification"
      WHERE "notification"."discordId" = "discord"."discordId"
        AND has_organization_access("notification"."organizationId")
    )
  );

-- Enable RLS on email table
ALTER TABLE "email" ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_access ON "email"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "notification"
      WHERE "notification"."emailId" = "email"."emailId"
        AND has_organization_access("notification"."organizationId")
    )
  );

-- Enable RLS on gotify table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'gotify') THEN
    ALTER TABLE "gotify" ENABLE ROW LEVEL SECURITY;
    EXECUTE 'CREATE POLICY gotify_access ON "gotify"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM "notification"
          WHERE "notification"."gotifyId" = "gotify"."gotifyId"
            AND has_organization_access("notification"."organizationId")
        )
      )';
  END IF;
END $$;

-- ==========================================
-- Schedule and rollback tables
-- ==========================================

-- Enable RLS on schedule table
ALTER TABLE "schedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_access ON "schedule"
  FOR ALL
  USING (
    ("applicationId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "application"
      INNER JOIN "project" ON "project"."projectId" = "application"."projectId"
      WHERE "application"."applicationId" = "schedule"."applicationId"
        AND has_organization_access("project"."organizationId")
    ))
    OR
    ("composeId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "compose"
      INNER JOIN "project" ON "project"."projectId" = "compose"."projectId"
      WHERE "compose"."composeId" = "schedule"."composeId"
        AND has_organization_access("project"."organizationId")
    ))
  );

-- Enable RLS on rollbacks table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'rollbacks') THEN
    ALTER TABLE "rollbacks" ENABLE ROW LEVEL SECURITY;
    EXECUTE 'CREATE POLICY rollbacks_access ON "rollbacks"
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM "deployment"
          WHERE "deployment"."deploymentId" = "rollbacks"."deploymentId"
        )
      )';
  END IF;
END $$;

-- ==========================================
-- User and Session tables (special handling)
-- ==========================================
-- Note: Session and user tables typically need different policies
-- as they're not organization-specific but user-specific

-- Enable RLS on session table
-- Sessions are accessed by session token, not organization
-- We'll allow access to own sessions only
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_access ON "session"
  FOR ALL
  USING (
    -- Allow if the session token matches (application layer will handle this)
    -- For now, we'll use a permissive policy and rely on application-layer checks
    true
  );

-- Enable RLS on users_temp table
-- Similar to session, user access is handled at application layer
ALTER TABLE "users_temp" ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_temp_access ON "users_temp"
  FOR ALL
  USING (
    -- Users can access their own record or users in their organizations
    id IN (
      SELECT "userId" FROM "member"
      WHERE has_organization_access("organization_id")
    )
  );

-- Enable RLS on account table
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_access ON "account"
  FOR ALL
  USING (
    -- Accounts belong to users who are members of accessible organizations
    "user_id" IN (
      SELECT "userId" FROM "member"
      WHERE has_organization_access("organization_id")
    )
  );

-- Enable RLS on verification table
-- Verification is public for the verification process
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_access ON "verification"
  FOR ALL
  USING (true);

-- ==========================================
-- Create indexes for performance
-- ==========================================
-- These indexes improve RLS policy performance

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_organizationId ON "project"("organizationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_projectId ON "application"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compose_projectId ON "compose"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mysql_projectId ON "mysql"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_postgres_projectId ON "postgres"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mariadb_projectId ON "mariadb"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mongo_projectId ON "mongo"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_redis_projectId ON "redis"("projectId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_member_organizationId ON "member"("organization_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_member_userId ON "member"("userId");
