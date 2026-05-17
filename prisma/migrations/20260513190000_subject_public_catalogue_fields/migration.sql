-- Public catalogue visibility and display order for subjects.
ALTER TABLE "Subject" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Subject" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Subject_isActive_priority_name_idx" ON "Subject"("isActive", "priority", "name");
