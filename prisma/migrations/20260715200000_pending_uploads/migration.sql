-- Track uploaded objects until the owning workflow commits a durable storage reference.
CREATE TABLE "PendingUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingUpload_storageKey_key" ON "PendingUpload"("storageKey");
CREATE INDEX "PendingUpload_ownerId_purpose_expiresAt_idx"
ON "PendingUpload"("ownerId", "purpose", "expiresAt");
CREATE INDEX "PendingUpload_expiresAt_idx" ON "PendingUpload"("expiresAt");

ALTER TABLE "PendingUpload"
ADD CONSTRAINT "PendingUpload_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
