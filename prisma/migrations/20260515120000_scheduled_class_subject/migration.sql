ALTER TABLE "ScheduledClass" ADD COLUMN "subjectId" TEXT;

CREATE INDEX "ScheduledClass_subjectId_idx" ON "ScheduledClass"("subjectId");

ALTER TABLE "ScheduledClass" ADD CONSTRAINT "ScheduledClass_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
