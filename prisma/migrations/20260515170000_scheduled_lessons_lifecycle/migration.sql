-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');

-- AlterTable
ALTER TABLE "ScheduledClass"
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "meetingProvider" TEXT,
  ADD COLUMN "googleCalendarEventId" TEXT,
  ADD COLUMN "googleMeetSpaceName" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "rescheduledFromId" TEXT;

-- AlterTable
ALTER TABLE "ReminderLog"
  ADD COLUMN "reminderWindowStart" TIMESTAMP(3),
  ADD COLUMN "reminderWindowEnd" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ScheduledClass_status_startAt_idx" ON "ScheduledClass"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_scheduledClassId_recipientUserId_channel_reminderWindowStart_reminderWindowEnd_key"
  ON "ReminderLog"("scheduledClassId", "recipientUserId", "channel", "reminderWindowStart", "reminderWindowEnd");
