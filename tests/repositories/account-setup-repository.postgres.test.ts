import { UserRole } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { changeInitialPassword } from "@/lib/repositories/account-setup-repository";

const runPostgres = process.env.RUN_A7_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];

async function createInitialSetupStudent() {
  const user = await prisma.appUser.create({
    data: {
      email: `initial-password-${runId}@example.com`,
      fullName: "Initial Password Student",
      role: UserRole.STUDENT,
      passwordHash: await hashPassword("CurrentPass123!"),
      isActive: true,
      mustChangePassword: true,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

suite("initial password PostgreSQL integration", { timeout: 60_000 }, () => {
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

  it("rotates an initial password transactionally and returns only session-safe identity", async () => {
    const user = await createInitialSetupStudent();

    const result = await changeInitialPassword(user.id, "CurrentPass123!", "NewPassword123!");
    const current = await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } });

    expect(result).toEqual({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: UserRole.STUDENT,
    });
    expect(await verifyPassword("NewPassword123!", current.passwordHash)).toBe(true);
    expect(current.mustChangePassword).toBe(false);
    await expect(
      prisma.adminAuditLog.count({
        where: { targetId: user.id, action: "INITIAL_PASSWORD_CHANGED" },
      }),
    ).resolves.toBe(1);
  });
});
