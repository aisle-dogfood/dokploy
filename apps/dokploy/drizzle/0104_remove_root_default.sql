-- Remove default 'root' value from server.username for security
ALTER TABLE "server" ALTER COLUMN "username" DROP DEFAULT;
