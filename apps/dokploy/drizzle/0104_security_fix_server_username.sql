-- Remove default 'root' value from server.username for security
-- This migration removes the dangerous default 'root' username from the server table
-- Existing records with 'root' username are kept but new records must explicitly specify username
ALTER TABLE "server" ALTER COLUMN "username" DROP DEFAULT;
