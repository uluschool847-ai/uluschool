-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('new', 'in_review', 'accepted', 'rejected');

-- Normalize old string status values before converting type
UPDATE "Enquiry"
SET "status" = LOWER("status");

-- AlterTable
ALTER TABLE "Enquiry"
ADD COLUMN "adminNotes" TEXT,
ALTER COLUMN "status" TYPE "EnquiryStatus" USING ("status"::"EnquiryStatus"),
ALTER COLUMN "status" SET DEFAULT 'new';

-- CreateTable
CREATE TABLE "ContactLead" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneWhatsapp" TEXT,
    "studentGrade" TEXT,
    "message" TEXT NOT NULL,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'new',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactLead_status_createdAt_idx" ON "ContactLead"("status", "createdAt");
