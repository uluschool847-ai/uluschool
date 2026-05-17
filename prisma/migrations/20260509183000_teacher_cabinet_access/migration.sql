-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "cabinetUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_cabinetUserId_key" ON "Teacher"("cabinetUserId");

-- AddForeignKey
ALTER TABLE "Teacher"
ADD CONSTRAINT "Teacher_cabinetUserId_fkey"
FOREIGN KEY ("cabinetUserId") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
