-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'LESSON_REMINDER',
  'ASSIGNMENT_OVERDUE',
  'SYSTEM_NOTICE',
  'GRADE_FEEDBACK',
  'ATTENDANCE_ALERT',
  'REPORT_READY'
);

-- CreateTable
CREATE TABLE "InAppNotification" (
  "id" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "relatedHref" TEXT,
  "deliveryStatus" "ReminderDeliveryStatus" NOT NULL DEFAULT 'SENT',
  "details" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "sourceReminderLogId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),

  CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InAppNotification_recipientUserId_dedupeKey_key" ON "InAppNotification"("recipientUserId", "dedupeKey");

-- CreateIndex
CREATE INDEX "InAppNotification_recipientUserId_readAt_createdAt_idx" ON "InAppNotification"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_type_createdAt_idx" ON "InAppNotification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_deliveryStatus_createdAt_idx" ON "InAppNotification"("deliveryStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
