-- CreateTable
CREATE TABLE "AssignmentReminderLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "details" TEXT,
    "reminderWindowStart" TIMESTAMP(3),
    "reminderWindowEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentReminderLog_assignmentId_recipientUserId_channel_reminderWindowStart_reminderWindowEnd_key" ON "AssignmentReminderLog"("assignmentId", "recipientUserId", "channel", "reminderWindowStart", "reminderWindowEnd");

-- CreateIndex
CREATE INDEX "AssignmentReminderLog_assignmentId_recipientUserId_channel_createdAt_idx" ON "AssignmentReminderLog"("assignmentId", "recipientUserId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentReminderLog_status_createdAt_idx" ON "AssignmentReminderLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AssignmentReminderLog" ADD CONSTRAINT "AssignmentReminderLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
