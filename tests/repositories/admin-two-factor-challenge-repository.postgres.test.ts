import { UserRole } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import {
  completeAdminTwoFactorChallenge,
  startAdminTwoFactorChallenge,
} from "@/lib/repositories/admin-two-factor-challenge-repository";

const runPostgres = process.env.RUN_ADMIN_TWO_FACTOR_CHALLENGE_POSTGRES === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];

async function createAdmin(backupCode: string) {
  const user = await prisma.appUser.create({
    data: {
      email: `admin-2fa-challenge-${runId}-${createdUserIds.length}@example.com`,
      fullName: "Admin Two-Factor Challenge",
      role: UserRole.ADMIN,
      passwordHash: await hashPassword("Admin-Two-Factor-Integration-Password"),
      isActive: true,
      mustChangePassword: false,
      twoFactorEnabled: true,
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorBackupCodes: [await hashPassword(backupCode)],
    },
  });
  createdUserIds.push(user.id);
  return user;
}

suite("admin two-factor challenge PostgreSQL concurrency", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: createdUserIds } } });
    await prisma.appUser.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows exactly one concurrent redemption of a backup code", async () => {
    const backupCode = "BACKUP-CONCURRENT-1";
    const user = await createAdmin(backupCode);
    const challenge = await startAdminTwoFactorChallenge({
      userId: user.id,
      authMethod: "password",
    });

    const results = await Promise.all([
      completeAdminTwoFactorChallenge({
        userId: user.id,
        challengeId: challenge.id,
        authMethod: "password",
        verification: { type: "backup", code: backupCode },
      }),
      completeAdminTwoFactorChallenge({
        userId: user.id,
        challengeId: challenge.id,
        authMethod: "password",
        verification: { type: "backup", code: backupCode },
      }),
    ]);

    const [current, backupSuccessAudits] = await Promise.all([
      prisma.appUser.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.adminAuditLog.findMany({
        where: { targetId: user.id, action: "ADMIN_LOGIN_2FA_BACKUP_SUCCESS" },
      }),
    ]);

    expect(results.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "rejected")).toHaveLength(1);
    expect(current.twoFactorBackupCodes).toEqual([]);
    expect(backupSuccessAudits).toHaveLength(1);
  });

  it("rolls back backup-code removal and success audit together", async () => {
    const backupCode = "BACKUP-ROLLBACK-1";
    const user = await createAdmin(backupCode);
    const challenge = await startAdminTwoFactorChallenge({
      userId: user.id,
      authMethod: "password",
    });
    const suffix = runId.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const functionName = `admin_2fa_reject_audit_${suffix}`;
    const triggerName = `admin_2fa_reject_audit_trigger_${suffix}`;
    const escapedUserId = user.id.replaceAll("'", "''");

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."targetId" = '${escapedUserId}' AND NEW."action" = 'ADMIN_LOGIN_2FA_BACKUP_SUCCESS' THEN
          RAISE EXCEPTION 'forced backup audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "AdminAuditLog"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
    `);

    try {
      await expect(
        completeAdminTwoFactorChallenge({
          userId: user.id,
          challengeId: challenge.id,
          authMethod: "password",
          verification: { type: "backup", code: backupCode },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AdminAuditLog";`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"();`);
    }

    const [current, persistedChallenge, backupSuccessAuditCount] = await Promise.all([
      prisma.appUser.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.adminTwoFactorChallenge.findUniqueOrThrow({ where: { id: challenge.id } }),
      prisma.adminAuditLog.count({
        where: { targetId: user.id, action: "ADMIN_LOGIN_2FA_BACKUP_SUCCESS" },
      }),
    ]);

    expect(current.twoFactorBackupCodes).toHaveLength(1);
    expect(persistedChallenge.consumedAt).toBeNull();
    expect(backupSuccessAuditCount).toBe(0);
  });
});
