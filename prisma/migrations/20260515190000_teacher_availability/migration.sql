-- CreateEnum
CREATE TYPE "AvailabilitySlotStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "TeacherAvailabilityRule" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Kiev',
    "status" "AvailabilitySlotStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherUnavailablePeriod" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherUnavailablePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAvailabilityRule_teacherId_weekday_status_idx" ON "TeacherAvailabilityRule"("teacherId", "weekday", "status");

-- CreateIndex
CREATE INDEX "TeacherUnavailablePeriod_teacherId_startAt_endAt_idx" ON "TeacherUnavailablePeriod"("teacherId", "startAt", "endAt");

-- AddForeignKey
ALTER TABLE "TeacherAvailabilityRule" ADD CONSTRAINT "TeacherAvailabilityRule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherUnavailablePeriod" ADD CONSTRAINT "TeacherUnavailablePeriod_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
