-- Student learning lifecycle is separate from account access (`isActive`).
CREATE TYPE "StudentLearningStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'INACTIVE');

ALTER TABLE "AppUser" ADD COLUMN "learningStatus" "StudentLearningStatus";

UPDATE "AppUser"
SET "learningStatus" = 'ACTIVE'
WHERE "role" = 'STUDENT' AND "learningStatus" IS NULL;
