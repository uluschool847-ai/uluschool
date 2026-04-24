-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'TEACHER', 'PARENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "ContactLead"
ADD COLUMN "referrer" TEXT,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmSource" TEXT;

-- AlterTable
ALTER TABLE "Enquiry"
ADD COLUMN "convertedAt" TIMESTAMP(3),
ADD COLUMN "referrer" TEXT,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmSource" TEXT;

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phoneWhatsapp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledClass" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "liveLessonUrl" TEXT NOT NULL,
    "teacherId" TEXT,
    "participantUserIds" TEXT[],
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "scheduledClassId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "ScheduledClass_startAt_idx" ON "ScheduledClass"("startAt");

-- CreateIndex
CREATE INDEX "ScheduledClass_teacherId_startAt_idx" ON "ScheduledClass"("teacherId", "startAt");

-- CreateIndex
CREATE INDEX "ReminderLog_scheduledClassId_recipientUserId_channel_createdAt_idx" ON "ReminderLog"("scheduledClassId", "recipientUserId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "ReminderLog_status_createdAt_idx" ON "ReminderLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactLead_utmSource_createdAt_idx" ON "ContactLead"("utmSource", "createdAt");

-- CreateIndex
CREATE INDEX "Enquiry_utmSource_createdAt_idx" ON "Enquiry"("utmSource", "createdAt");

-- AddForeignKey
ALTER TABLE "ScheduledClass" ADD CONSTRAINT "ScheduledClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_scheduledClassId_fkey" FOREIGN KEY ("scheduledClassId") REFERENCES "ScheduledClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
