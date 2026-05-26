-- Extend local automation with task priority and human-reviewed AI drafts.

CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AiDraftType" AS ENUM ('REPORT_COMMENT', 'CRM_FOLLOW_UP', 'PARENT_SUMMARY', 'MESSAGE_COPY');
CREATE TYPE "AiDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

ALTER TABLE "ManagerTask"
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';

CREATE INDEX "ManagerTask_priority_status_idx" ON "ManagerTask"("priority", "status");

CREATE TABLE "AiDraft" (
  "id" TEXT NOT NULL,
  "type" "AiDraftType" NOT NULL,
  "status" "AiDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "inputSnapshot" JSONB NOT NULL,
  "outputText" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "relatedStudentId" TEXT,
  "relatedReportSnapshotId" TEXT,
  "relatedEnquiryId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "model" TEXT NOT NULL DEFAULT 'local-deterministic',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiDraft_createdById_type_status_idx" ON "AiDraft"("createdById", "type", "status");
CREATE INDEX "AiDraft_relatedStudentId_idx" ON "AiDraft"("relatedStudentId");
CREATE INDEX "AiDraft_relatedReportSnapshotId_idx" ON "AiDraft"("relatedReportSnapshotId");
CREATE INDEX "AiDraft_relatedEnquiryId_idx" ON "AiDraft"("relatedEnquiryId");

ALTER TABLE "AiDraft"
  ADD CONSTRAINT "AiDraft_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiDraft"
  ADD CONSTRAINT "AiDraft_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
