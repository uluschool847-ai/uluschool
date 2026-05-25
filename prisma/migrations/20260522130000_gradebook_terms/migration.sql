-- CreateEnum
CREATE TYPE "GradebookCategory" AS ENUM ('HOMEWORK', 'MANUAL');

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualGradeEntry" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "academicTermId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "gradedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualGradeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicTerm_isActive_startDate_idx" ON "AcademicTerm"("isActive", "startDate");

-- CreateIndex
CREATE INDEX "AcademicTerm_startDate_endDate_idx" ON "AcademicTerm"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "ManualGradeEntry_teacherId_studentId_academicTermId_archivedAt_idx" ON "ManualGradeEntry"("teacherId", "studentId", "academicTermId", "archivedAt");

-- CreateIndex
CREATE INDEX "ManualGradeEntry_studentId_academicTermId_archivedAt_idx" ON "ManualGradeEntry"("studentId", "academicTermId", "archivedAt");

-- CreateIndex
CREATE INDEX "ManualGradeEntry_classGroupId_academicTermId_archivedAt_idx" ON "ManualGradeEntry"("classGroupId", "academicTermId", "archivedAt");

-- CreateIndex
CREATE INDEX "ManualGradeEntry_subjectId_idx" ON "ManualGradeEntry"("subjectId");

-- AddForeignKey
ALTER TABLE "ManualGradeEntry" ADD CONSTRAINT "ManualGradeEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualGradeEntry" ADD CONSTRAINT "ManualGradeEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualGradeEntry" ADD CONSTRAINT "ManualGradeEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualGradeEntry" ADD CONSTRAINT "ManualGradeEntry_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualGradeEntry" ADD CONSTRAINT "ManualGradeEntry_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
