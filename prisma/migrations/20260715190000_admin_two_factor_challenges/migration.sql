-- Add a database-backed, single-use administrator 2FA challenge. Existing user rows are untouched.
CREATE TABLE "AdminTwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminTwoFactorChallenge_userId_expiresAt_idx"
ON "AdminTwoFactorChallenge"("userId", "expiresAt");

CREATE INDEX "AdminTwoFactorChallenge_expiresAt_consumedAt_idx"
ON "AdminTwoFactorChallenge"("expiresAt", "consumedAt");

ALTER TABLE "AdminTwoFactorChallenge"
ADD CONSTRAINT "AdminTwoFactorChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
