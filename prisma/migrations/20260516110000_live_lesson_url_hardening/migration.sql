-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('GOOGLE_MEET', 'MANUAL_URL');

-- Normalize existing free-form meeting provider values before converting the column.
UPDATE "ScheduledClass"
SET "meetingProvider" = 'GOOGLE_MEET'
WHERE "meetingProvider" IS NULL OR "meetingProvider" = '';

UPDATE "ScheduledClass"
SET "meetingProvider" = 'MANUAL_URL'
WHERE "meetingProvider" NOT IN ('GOOGLE_MEET', 'MANUAL_URL');

-- AlterTable
ALTER TABLE "ScheduledClass"
  ALTER COLUMN "liveLessonUrl" DROP NOT NULL;

ALTER TABLE "ScheduledClass"
  ALTER COLUMN "meetingProvider" TYPE "MeetingProvider" USING "meetingProvider"::"MeetingProvider",
  ALTER COLUMN "meetingProvider" SET DEFAULT 'GOOGLE_MEET',
  ALTER COLUMN "meetingProvider" SET NOT NULL,
  ADD COLUMN "meetingCreatedAt" TIMESTAMP(3),
  ADD COLUMN "meetingUpdatedAt" TIMESTAMP(3);
