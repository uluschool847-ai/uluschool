-- Preserve pending cleanup work while a worker performs fallible reference and storage operations.
ALTER TABLE "PendingUpload"
ADD COLUMN "claimToken" TEXT,
ADD COLUMN "claimedAt" TIMESTAMP(3);

ALTER TABLE "PendingUpload"
ADD CONSTRAINT "PendingUpload_claim_pair_check"
CHECK (("claimToken" IS NULL) = ("claimedAt" IS NULL));

CREATE INDEX "PendingUpload_expiresAt_claimedAt_idx"
ON "PendingUpload"("expiresAt", "claimedAt");

-- Account for finalized objects independently of their domain reference representation.
CREATE TABLE "ActiveStorageObject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveStorageObject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActiveStorageObject_byteSize_check" CHECK ("byteSize" > 0)
);

CREATE UNIQUE INDEX "ActiveStorageObject_storageKey_key"
ON "ActiveStorageObject"("storageKey");

CREATE INDEX "ActiveStorageObject_ownerId_purpose_idx"
ON "ActiveStorageObject"("ownerId", "purpose");

ALTER TABLE "ActiveStorageObject"
ADD CONSTRAINT "ActiveStorageObject_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
