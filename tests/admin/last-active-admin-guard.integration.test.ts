import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { toggleUserStatus, updateUserRole } from "@/lib/repositories/portal-repository";

const DB_TEST_TIMEOUT_MS = 15_000;
const ROLLBACK_LAST_ADMIN_TEST = new Error("ROLLBACK_LAST_ADMIN_TEST");

describe("last active admin guard integration", () => {
  it(
    "prevents deactivating or demoting the last active admin without committing isolated setup",
    async () => {
      const email = `last-active-admin-${Date.now()}@example.test`;

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.appUser.updateMany({
            where: { role: UserRole.ADMIN, isActive: true },
            data: { isActive: false },
          });

          const lastActiveAdmin = await tx.appUser.create({
            data: {
              email,
              fullName: "Last Active Admin Guard",
              role: UserRole.ADMIN,
              isActive: true,
              passwordHash: "test-only-password-hash",
            },
            select: {
              id: true,
              isActive: true,
              role: true,
            },
          });

          await expect(
            toggleUserStatus(lastActiveAdmin.id, false, "different-admin-id", tx),
          ).rejects.toThrow(/last admin|cannot deactivate/i);

          await expect(
            updateUserRole(lastActiveAdmin.id, UserRole.TEACHER, "different-admin-id", tx),
          ).rejects.toThrow(/last admin|cannot demote/i);

          const unchangedAdmin = await tx.appUser.findUnique({
            where: { id: lastActiveAdmin.id },
            select: {
              isActive: true,
              role: true,
            },
          });

          expect(unchangedAdmin).toEqual({
            isActive: true,
            role: UserRole.ADMIN,
          });

          throw ROLLBACK_LAST_ADMIN_TEST;
        }),
      ).rejects.toBe(ROLLBACK_LAST_ADMIN_TEST);

      await expect(
        prisma.appUser.findUnique({
          where: { email },
        }),
      ).resolves.toBeNull();
    },
    DB_TEST_TIMEOUT_MS,
  );
});
