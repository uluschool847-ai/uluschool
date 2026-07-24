-- Deployment 1 no longer reads or writes these objects.
BEGIN;

DROP TABLE "AdminTwoFactorChallenge";

ALTER TABLE "AppUser"
  DROP COLUMN "twoFactorBackupCodes",
  DROP COLUMN "twoFactorEnabled",
  DROP COLUMN "twoFactorSecret";

COMMIT;
