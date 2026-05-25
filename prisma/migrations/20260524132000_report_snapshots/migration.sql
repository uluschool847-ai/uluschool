-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "generatedByTeacherId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "teacherComment" TEXT,
    "snapshotData" JSONB NOT NULL,
    "pdfStorageKey" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSnapshot_generatedByTeacherId_generatedAt_idx" ON "ReportSnapshot"("generatedByTeacherId", "generatedAt");

-- CreateIndex
CREATE INDEX "ReportSnapshot_studentId_academicTermId_idx" ON "ReportSnapshot"("studentId", "academicTermId");

-- CreateIndex
CREATE INDEX "ReportSnapshot_classGroupId_academicTermId_idx" ON "ReportSnapshot"("classGroupId", "academicTermId");

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_generatedByTeacherId_fkey" FOREIGN KEY ("generatedByTeacherId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
