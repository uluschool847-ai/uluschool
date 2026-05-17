-- Public FAQ publication status.
ALTER TABLE "FaqItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';

CREATE INDEX "FaqItem_status_displayOrder_createdAt_idx" ON "FaqItem"("status", "displayOrder", "createdAt");
