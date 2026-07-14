import { UserRole } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getBackupCodeHashFingerprint, hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import {
  beginInitialAdminTwoFactorEnrollment,
  confirmInitialAdminTwoFactorEnrollment,
  recoverInitialAdminTwoFactorHandoff,
} from "@/lib/repositories/account-setup-repository";

const runPostgres = process.env.RUN_A7_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];

async function createAdmin(secret: string) {
  const user = await prisma.appUser.create({
    data: {
      email: `a7-postgres-${runId}-${createdUserIds.length}@example.com`,
      fullName: "A7 PostgreSQL Admin",
      role: UserRole.ADMIN,
      passwordHash: await hashPassword("A7-Integration-Password"),
      isActive: true,
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorSecret: secret,
      twoFactorBackupCodes: [],
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function hashCodes(prefix: string) {
  const plain = Array.from({ length: 8 }, (_, index) => `${prefix}-${index + 1}`);
  return {
    plain,
    hashed: await Promise.all(plain.map((code) => hashPassword(code))),
  };
}

function identity(user: { id: string; email: string }) {
  return { userId: user.id, email: user.email, role: UserRole.ADMIN };
}

suite("initial admin 2FA PostgreSQL concurrency", { timeout: 60_000 }, () => {
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

  it("serializes competing begin/begin rotations to one valid final secret", async () => {
    const user = await createAdmin("JBSWY3DPEHPK3PXP");
    const secrets = ["KRSXG5DSNFXGOIDB", "MFRGGZDFMZTWQ2LK"];

    const results = await Promise.allSettled(
      secrets.map((secret) => beginInitialAdminTwoFactorEnrollment({ ...identity(user), secret })),
    );
    const current = await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } });

    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(secrets).toContain(current.twoFactorSecret);
    expect(current.twoFactorEnabled).toBe(false);
    expect(current.twoFactorBackupCodes).toEqual([]);
  });

  it("keeps begin/confirm competition in one coherent enrollment state", async () => {
    const currentSecret = "JBSWY3DPEHPK3PXP";
    const rotatedSecret = "KRSXG5DSNFXGOIDB";
    const user = await createAdmin(currentSecret);
    const codes = await hashCodes("BEGIN-CONFIRM");

    await Promise.allSettled([
      beginInitialAdminTwoFactorEnrollment({ ...identity(user), secret: rotatedSecret }),
      confirmInitialAdminTwoFactorEnrollment({
        ...identity(user),
        expectedSecret: currentSecret,
        backupCodeHashes: codes.hashed,
      }),
    ]);

    const [current, audits] = await Promise.all([
      prisma.appUser.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.adminAuditLog.findMany({
        where: { targetId: user.id, action: "ADMIN_2FA_ENABLED" },
      }),
    ]);

    expect(audits.length).toBeLessThanOrEqual(1);
    if (current.twoFactorEnabled) {
      expect(current.twoFactorSecret).toBe(currentSecret);
      expect(current.twoFactorBackupCodes).toEqual(codes.hashed);
      expect(audits).toHaveLength(1);
    } else {
      expect(current.twoFactorSecret).toBe(rotatedSecret);
      expect(current.twoFactorBackupCodes).toEqual([]);
      expect(audits).toHaveLength(0);
    }
  });

  it("allows only one confirm/confirm winner and persists eight usable hashes", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = await createAdmin(secret);
    const [firstCodes, secondCodes] = await Promise.all([
      hashCodes("CONFIRM-A"),
      hashCodes("CONFIRM-B"),
    ]);

    const results = await Promise.allSettled([
      confirmInitialAdminTwoFactorEnrollment({
        ...identity(user),
        expectedSecret: secret,
        backupCodeHashes: firstCodes.hashed,
      }),
      confirmInitialAdminTwoFactorEnrollment({
        ...identity(user),
        expectedSecret: secret,
        backupCodeHashes: secondCodes.hashed,
      }),
    ]);
    const [current, audits] = await Promise.all([
      prisma.appUser.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.adminAuditLog.findMany({
        where: { targetId: user.id, action: "ADMIN_2FA_ENABLED" },
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(current.twoFactorEnabled).toBe(true);
    expect(current.twoFactorBackupCodes).toHaveLength(8);
    expect(audits).toHaveLength(1);
    const winningCodes =
      current.twoFactorBackupCodes[0] === firstCodes.hashed[0] ? firstCodes : secondCodes;
    expect(await verifyPassword(winningCodes.plain[0], current.twoFactorBackupCodes[0])).toBe(true);
  });

  it("rolls back the user update when PostgreSQL rejects the success audit", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = await createAdmin(secret);
    const codes = await hashCodes("ROLLBACK");
    const suffix = runId.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const functionName = `a7_reject_audit_${suffix}`;
    const triggerName = `a7_reject_audit_trigger_${suffix}`;
    const escapedUserId = user.id.replaceAll("'", "''");

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."targetId" = '${escapedUserId}' AND NEW."action" = 'ADMIN_2FA_ENABLED' THEN
          RAISE EXCEPTION 'A7 forced audit failure';
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
        confirmInitialAdminTwoFactorEnrollment({
          ...identity(user),
          expectedSecret: secret,
          backupCodeHashes: codes.hashed,
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AdminAuditLog";`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"();`);
    }

    const [current, auditCount] = await Promise.all([
      prisma.appUser.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.adminAuditLog.count({ where: { targetId: user.id } }),
    ]);
    expect(current.twoFactorEnabled).toBe(false);
    expect(current.twoFactorBackupCodes).toEqual([]);
    expect(auditCount).toBe(0);
  });

  it("consumes a handoff fingerprint once and rejects replay after rotation", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const user = await createAdmin(secret);
    const [committedCodes, recoveredCodes, replayCodes] = await Promise.all([
      hashCodes("HANDOFF-COMMITTED"),
      hashCodes("HANDOFF-RECOVERED"),
      hashCodes("HANDOFF-REPLAY"),
    ]);
    await confirmInitialAdminTwoFactorEnrollment({
      ...identity(user),
      expectedSecret: secret,
      backupCodeHashes: committedCodes.hashed,
    });
    const expectedBackupCodeHashFingerprint = await getBackupCodeHashFingerprint(
      committedCodes.hashed,
    );

    await recoverInitialAdminTwoFactorHandoff({
      userId: user.id,
      expectedBackupCodeHashFingerprint,
      backupCodeHashes: recoveredCodes.hashed,
    });
    await expect(
      recoverInitialAdminTwoFactorHandoff({
        userId: user.id,
        expectedBackupCodeHashFingerprint,
        backupCodeHashes: replayCodes.hashed,
      }),
    ).rejects.toMatchObject({ code: "HANDOFF_CHANGED" });

    const current = await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } });
    expect(current.twoFactorBackupCodes).toEqual(recoveredCodes.hashed);
    expect(
      await prisma.adminAuditLog.count({
        where: { targetId: user.id, action: "ADMIN_2FA_BACKUP_CREDENTIALS_ROTATED" },
      }),
    ).toBe(1);
  });
});
