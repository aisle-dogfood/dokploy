-- Security hardening: Remove default 'root' username
ALTER TABLE "server" ALTER COLUMN "username" DROP DEFAULT;
