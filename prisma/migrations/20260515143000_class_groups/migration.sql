-- CreateEnum
CREATE TYPE "ClassGroupStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "ScheduledClass" ADD COLUMN "classGroupId" TEXT;

-- CreateTable
CREATE TABLE "ClassGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subjectId" TEXT,
    "levelId" TEXT,
    "teacherId" TEXT,
    "status" "ClassGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "capacity" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClassGroupEnrollments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- Backfill one generated group per existing scheduled class.
INSERT INTO "ClassGroup" (
    "id",
    "name",
    "description",
    "subjectId",
    "levelId",
    "teacherId",
    "status",
    "capacity",
    "startDate",
    "endDate",
    "createdAt",
    "updatedAt"
)
SELECT
    'class-group-' || "ScheduledClass"."id",
    "ScheduledClass"."title",
    "ScheduledClass"."description",
    "ScheduledClass"."subjectId",
    NULL,
    "ScheduledClass"."teacherId",
    'ACTIVE',
    NULL,
    "ScheduledClass"."startAt",
    NULL,
    "ScheduledClass"."createdAt",
    "ScheduledClass"."updatedAt"
FROM "ScheduledClass"
WHERE "ScheduledClass"."classGroupId" IS NULL;

UPDATE "ScheduledClass"
SET "classGroupId" = 'class-group-' || "ScheduledClass"."id"
WHERE "ScheduledClass"."classGroupId" IS NULL;

INSERT INTO "_ClassGroupEnrollments" ("A", "B")
SELECT "_ClassEnrollments"."A", "ScheduledClass"."classGroupId"
FROM "_ClassEnrollments"
INNER JOIN "ScheduledClass" ON "ScheduledClass"."id" = "_ClassEnrollments"."B"
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE INDEX "ClassGroup_status_name_idx" ON "ClassGroup"("status", "name");

-- CreateIndex
CREATE INDEX "ClassGroup_teacherId_idx" ON "ClassGroup"("teacherId");

-- CreateIndex
CREATE INDEX "ClassGroup_subjectId_idx" ON "ClassGroup"("subjectId");

-- CreateIndex
CREATE INDEX "ClassGroup_levelId_idx" ON "ClassGroup"("levelId");

-- CreateIndex
CREATE INDEX "ScheduledClass_classGroupId_startAt_idx" ON "ScheduledClass"("classGroupId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "_ClassGroupEnrollments_AB_unique" ON "_ClassGroupEnrollments"("A", "B");

-- CreateIndex
CREATE INDEX "_ClassGroupEnrollments_B_index" ON "_ClassGroupEnrollments"("B");

-- AddForeignKey
ALTER TABLE "ScheduledClass" ADD CONSTRAINT "ScheduledClass_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassGroupEnrollments" ADD CONSTRAINT "_ClassGroupEnrollments_A_fkey" FOREIGN KEY ("A") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassGroupEnrollments" ADD CONSTRAINT "_ClassGroupEnrollments_B_fkey" FOREIGN KEY ("B") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
