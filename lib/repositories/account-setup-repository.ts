import { Prisma, UserRole } from "@prisma/client";

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
  twoFactorEnabled: boolean;
};

export type InitialAdminTwoFactorEnrollmentErrorCode =
  | "INVALID_SETUP"
  | "ALREADY_ENABLED"
  | "SECRET_CHANGED"
  | "INVALID_BACKUP_CODES";

export class InitialAdminTwoFactorEnrollmentError extends Error {
  constructor(public readonly code: InitialAdminTwoFactorEnrollmentErrorCode) {
    super("Initial admin two-factor enrollment failed");
    this.name = "InitialAdminTwoFactorEnrollmentError";
  }
}

type InitialAdminSetupIdentity = {
  userId: string;
  email: string;
  role: UserRole;
};

type InitialAdminTwoFactorUser = SafeInitialSetupUser & {
  twoFactorSecret: string | null;
};

const initialAdminTwoFactorSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  mustChangePassword: true,
  isActive: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
} as const;

function requireEligibleInitialAdmin<
  T extends InitialAdminTwoFactorUser & {
    isActive: boolean;
    mustChangePassword: boolean;
  },
>(user: T | null, identity: InitialAdminSetupIdentity): T {
  if (
    !user?.isActive ||
    user.mustChangePassword ||
    identity.role !== UserRole.ADMIN ||
    user.id !== identity.userId ||
    user.email !== identity.email ||
    user.role !== UserRole.ADMIN ||
    user.role !== identity.role
  ) {
    throw new InitialAdminTwoFactorEnrollmentError("INVALID_SETUP");
  }

  if (user.twoFactorEnabled) {
    throw new InitialAdminTwoFactorEnrollmentError("ALREADY_ENABLED");
  }

  return user;
}

function toInitialAdminTwoFactorUser(user: InitialAdminTwoFactorUser): InitialAdminTwoFactorUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorSecret: user.twoFactorSecret,
  };
}

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
          twoFactorEnabled: true,
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
        twoFactorEnabled: currentUser.twoFactorEnabled,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getInitialAdminTwoFactorEnrollment(
  identity: InitialAdminSetupIdentity,
): Promise<InitialAdminTwoFactorUser> {
  const user = requireEligibleInitialAdmin(
    await findUserForInitialSetup(identity.userId),
    identity,
  );

  return toInitialAdminTwoFactorUser(user);
}

export async function beginInitialAdminTwoFactorEnrollment(
  input: InitialAdminSetupIdentity & { secret: string },
): Promise<InitialAdminTwoFactorUser> {
  return prisma.$transaction(
    async (transaction) => {
      const currentUser = requireEligibleInitialAdmin(
        await transaction.appUser.findUnique({
          where: { id: input.userId },
          select: initialAdminTwoFactorSelect,
        }),
        input,
      );

      await transaction.appUser.update({
        where: { id: currentUser.id },
        data: {
          twoFactorSecret: input.secret,
          twoFactorEnabled: false,
          twoFactorBackupCodes: [],
        },
      });

      return toInitialAdminTwoFactorUser({
        ...currentUser,
        twoFactorSecret: input.secret,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function confirmInitialAdminTwoFactorEnrollment(
  input: InitialAdminSetupIdentity & {
    expectedSecret: string;
    backupCodeHashes: string[];
  },
): Promise<SafeInitialSetupUser> {
  if (
    input.backupCodeHashes.length !== 8 ||
    new Set(input.backupCodeHashes).size !== input.backupCodeHashes.length
  ) {
    throw new InitialAdminTwoFactorEnrollmentError("INVALID_BACKUP_CODES");
  }

  return prisma.$transaction(
    async (transaction) => {
      const currentUser = requireEligibleInitialAdmin(
        await transaction.appUser.findUnique({
          where: { id: input.userId },
          select: initialAdminTwoFactorSelect,
        }),
        input,
      );

      if (!currentUser.twoFactorSecret || currentUser.twoFactorSecret !== input.expectedSecret) {
        throw new InitialAdminTwoFactorEnrollmentError("SECRET_CHANGED");
      }

      await transaction.appUser.update({
        where: { id: currentUser.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: currentUser.twoFactorSecret,
          twoFactorBackupCodes: input.backupCodeHashes,
        },
      });

      await createAdminAuditLog(
        {
          adminUserId: currentUser.id,
          action: "ADMIN_2FA_ENABLED",
          targetType: "AppUser",
          targetId: currentUser.id,
          before: { twoFactorEnabled: false },
          after: { twoFactorEnabled: true },
          meta: { actorRole: UserRole.ADMIN, setupFlow: "INITIAL_SETUP" },
        },
        transaction,
      );

      return {
        id: currentUser.id,
        email: currentUser.email,
        fullName: currentUser.fullName,
        role: currentUser.role,
        twoFactorEnabled: true,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
