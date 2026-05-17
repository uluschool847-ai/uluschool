-- Make audit logs independent from the lifecycle of the live AppUser row.
ALTER TABLE "AdminAuditLog" ADD COLUMN "actorId" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN "actorEmail" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN "actorFullName" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN "actorRole" TEXT;

UPDATE "AdminAuditLog" AS audit
SET
  "actorId" = audit."adminUserId",
  "actorEmail" = app_user."email",
  "actorFullName" = app_user."fullName",
  "actorRole" = app_user."role"::TEXT
FROM "AppUser" AS app_user
WHERE audit."adminUserId" = app_user."id";

UPDATE "AdminAuditLog"
SET "actorId" = "adminUserId"
WHERE "actorId" IS NULL;

ALTER TABLE "AdminAuditLog" ALTER COLUMN "actorId" SET NOT NULL;

ALTER TABLE "AdminAuditLog" DROP CONSTRAINT "AdminAuditLog_adminUserId_fkey";
ALTER TABLE "AdminAuditLog" ALTER COLUMN "adminUserId" DROP NOT NULL;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");
