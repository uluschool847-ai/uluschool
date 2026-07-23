import { Prisma, type UserRole } from "@prisma/client";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { findUserForInitialSetup } from "@/lib/repositories/user-repository";

export type InitialPasswordChangeErrorCode =
  | "INVALID_SETUP"
  | "INVALID_CURRENT_PASSWORD"
  | "PASSWORD_REUSE";

export class InitialPasswordChangeError extends Error {
  constructor(public readonly code: InitialPasswordChangeErrorCode) {
    super("Initial password change failed");
    this.name = "InitialPasswordChangeError";
  }
}

export type SafeInitialSetupUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

function isEligibleForPasswordChange<
  T extends {
    isActive: boolean;
    mustChangePassword: boolean;
  },
>(user: T | null): user is T {
  return Boolean(user?.isActive && user.mustChangePassword);
}

export async function changeInitialPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<SafeInitialSetupUser> {
  const setupUser = await findUserForInitialSetup(userId);
  if (!isEligibleForPasswordChange(setupUser)) {
    throw new InitialPasswordChangeError("INVALID_SETUP");
  }

  if (!(await verifyPassword(currentPassword, setupUser.passwordHash))) {
    throw new InitialPasswordChangeError("INVALID_CURRENT_PASSWORD");
  }

  if (await verifyPassword(newPassword, setupUser.passwordHash)) {
    throw new InitialPasswordChangeError("PASSWORD_REUSE");
  }

  return prisma.$transaction(
    async (transaction) => {
      const currentUser = await transaction.appUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          passwordHash: true,
          mustChangePassword: true,
          isActive: true,
        },
      });

      if (
        !isEligibleForPasswordChange(currentUser) ||
        currentUser.id !== setupUser.id ||
        currentUser.role !== setupUser.role ||
        currentUser.passwordHash !== setupUser.passwordHash
      ) {
        throw new InitialPasswordChangeError("INVALID_SETUP");
      }

      if (!(await verifyPassword(currentPassword, currentUser.passwordHash))) {
        throw new InitialPasswordChangeError("INVALID_CURRENT_PASSWORD");
      }

      if (await verifyPassword(newPassword, currentUser.passwordHash)) {
        throw new InitialPasswordChangeError("PASSWORD_REUSE");
      }

      const passwordHash = await hashPassword(newPassword);
      await transaction.appUser.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
      });

      await createAdminAuditLog(
        {
          adminUserId: currentUser.id,
          action: "INITIAL_PASSWORD_CHANGED",
          targetType: "AUTH",
          targetId: currentUser.id,
          before: { mustChangePassword: true },
          after: { mustChangePassword: false },
        },
        transaction,
      );

      return {
        id: currentUser.id,
        email: currentUser.email,
        fullName: currentUser.fullName,
        role: currentUser.role,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
