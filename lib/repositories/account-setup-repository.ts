import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";

import {
  getBackupCodeHashFingerprint,
  hashPassword,
  isPasswordHash,
  verifyPassword,
} from "@/lib/auth/password";
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
  | "INVALID_BACKUP_CODES"
  | "HANDOFF_CHANGED";

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

const initialAdminIdentitySchema = z
  .object({
    userId: z
      .string()
      .min(1)
      .max(191)
      .refine((value) => value === value.trim()),
    email: z
      .string()
      .email()
      .max(320)
      .refine((value) => value === value.trim()),
    role: z.literal(UserRole.ADMIN),
  })
  .strict();
const totpSecretSchema = z.string().regex(/^[A-Z2-7]{16,128}$/);
const backupCodeHashesSchema = z
  .array(z.string().refine((value) => isPasswordHash(value)))
  .length(8)
  .refine((hashes) => new Set(hashes).size === hashes.length);
const beginEnrollmentSchema = initialAdminIdentitySchema
  .extend({ secret: totpSecretSchema })
  .strict();
const confirmEnrollmentSchema = initialAdminIdentitySchema
  .extend({
    expectedSecret: totpSecretSchema,
    backupCodeHashes: backupCodeHashesSchema,
  })
  .strict();
const handoffAuthorizationSchema = z
  .object({
    userId: z
      .string()
      .min(1)
      .max(191)
      .refine((value) => value === value.trim()),
    expectedBackupCodeHashFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const recoverHandoffSchema = handoffAuthorizationSchema
  .extend({ backupCodeHashes: backupCodeHashesSchema })
  .strict();

type InitialAdminTwoFactorUser = SafeInitialSetupUser & {
  twoFactorSecret: string | null;
};

type InitialAdminTwoFactorPersistenceUser = InitialAdminTwoFactorUser & {
  twoFactorBackupCodes: string[];
};

type InitialAdminTwoFactorHandoffAuthorization = z.infer<typeof handoffAuthorizationSchema>;

const initialAdminTwoFactorSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  mustChangePassword: true,
  isActive: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorBackupCodes: true,
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

function requireEligibleInitialAdminHandoff<
  T extends InitialAdminTwoFactorPersistenceUser & {
    isActive: boolean;
    mustChangePassword: boolean;
  },
>(user: T | null, userId: string): T {
  if (
    !user?.isActive ||
    user.mustChangePassword ||
    !user.twoFactorEnabled ||
    user.id !== userId ||
    user.role !== UserRole.ADMIN
  ) {
    throw new InitialAdminTwoFactorEnrollmentError("INVALID_SETUP");
  }

  return user;
}

function parseInitialAdminHandoffAuthorization(
  input: unknown,
): InitialAdminTwoFactorHandoffAuthorization {
  const parsed = handoffAuthorizationSchema.safeParse(input);
  if (!parsed.success) {
    throw new InitialAdminTwoFactorEnrollmentError("INVALID_SETUP");
  }
  return parsed.data;
}

async function requireMatchingBackupCodeHashFingerprint(
  hashes: unknown,
  expectedFingerprint: string,
) {
  let actualFingerprint: string;
  try {
    actualFingerprint = await getBackupCodeHashFingerprint(hashes);
  } catch {
    throw new InitialAdminTwoFactorEnrollmentError("HANDOFF_CHANGED");
  }

  if (actualFingerprint !== expectedFingerprint) {
    throw new InitialAdminTwoFactorEnrollmentError("HANDOFF_CHANGED");
  }
}

function parseInitialAdminIdentity(input: unknown): InitialAdminSetupIdentity {
  const parsed = initialAdminIdentitySchema.safeParse(input);
  if (!parsed.success) {
    throw new InitialAdminTwoFactorEnrollmentError("INVALID_SETUP");
  }
  return parsed.data;
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
  const parsedIdentity = parseInitialAdminIdentity(identity);
  const user = requireEligibleInitialAdmin(
    await findUserForInitialSetup(parsedIdentity.userId),
    parsedIdentity,
  );

  return toInitialAdminTwoFactorUser(user);
}

export async function getInitialAdminTwoFactorHandoff(
  authorization: InitialAdminTwoFactorHandoffAuthorization,
): Promise<InitialAdminTwoFactorUser> {
  const parsed = parseInitialAdminHandoffAuthorization(authorization);
  const user = requireEligibleInitialAdminHandoff(
    await findUserForInitialSetup(parsed.userId),
    parsed.userId,
  );
  await requireMatchingBackupCodeHashFingerprint(
    user.twoFactorBackupCodes,
    parsed.expectedBackupCodeHashFingerprint,
  );

  return toInitialAdminTwoFactorUser(user);
}

export async function beginInitialAdminTwoFactorEnrollment(
  input: InitialAdminSetupIdentity & { secret: string },
): Promise<InitialAdminTwoFactorUser> {
  const parsed = beginEnrollmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new InitialAdminTwoFactorEnrollmentError("INVALID_SETUP");
  }

  return prisma.$transaction(
    async (transaction) => {
      const currentUser = requireEligibleInitialAdmin(
        await transaction.appUser.findUnique({
          where: { id: parsed.data.userId },
          select: initialAdminTwoFactorSelect,
        }),
        parsed.data,
      );

      await transaction.appUser.update({
        where: { id: currentUser.id },
        data: {
          twoFactorSecret: parsed.data.secret,
          twoFactorEnabled: false,
          twoFactorBackupCodes: [],
        },
      });

      return toInitialAdminTwoFactorUser({
        ...currentUser,
        twoFactorSecret: parsed.data.secret,
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
  const parsed = confirmEnrollmentSchema.safeParse(input);
  if (!parsed.success) {
    const identityAndSecretValid = initialAdminIdentitySchema
      .extend({ expectedSecret: totpSecretSchema })
      .strict()
      .safeParse({
        userId: input?.userId,
        email: input?.email,
        role: input?.role,
        expectedSecret: input?.expectedSecret,
      }).success;
    throw new InitialAdminTwoFactorEnrollmentError(
      identityAndSecretValid ? "INVALID_BACKUP_CODES" : "INVALID_SETUP",
    );
  }

  return prisma.$transaction(
    async (transaction) => {
      const currentUser = requireEligibleInitialAdmin(
        await transaction.appUser.findUnique({
          where: { id: parsed.data.userId },
          select: initialAdminTwoFactorSelect,
        }),
        parsed.data,
      );

      if (
        !currentUser.twoFactorSecret ||
        currentUser.twoFactorSecret !== parsed.data.expectedSecret
      ) {
        throw new InitialAdminTwoFactorEnrollmentError("SECRET_CHANGED");
      }

      await transaction.appUser.update({
        where: { id: currentUser.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: currentUser.twoFactorSecret,
          twoFactorBackupCodes: parsed.data.backupCodeHashes,
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

export async function recoverInitialAdminTwoFactorHandoff(
  input: InitialAdminTwoFactorHandoffAuthorization & { backupCodeHashes: string[] },
): Promise<SafeInitialSetupUser> {
  const parsed = recoverHandoffSchema.safeParse(input);
  if (!parsed.success) {
    const authorizationValid = handoffAuthorizationSchema.safeParse({
      userId: input?.userId,
      expectedBackupCodeHashFingerprint: input?.expectedBackupCodeHashFingerprint,
    }).success;
    throw new InitialAdminTwoFactorEnrollmentError(
      authorizationValid ? "INVALID_BACKUP_CODES" : "INVALID_SETUP",
    );
  }

  return prisma.$transaction(
    async (transaction) => {
      const currentUser = requireEligibleInitialAdminHandoff(
        await transaction.appUser.findUnique({
          where: { id: parsed.data.userId },
          select: initialAdminTwoFactorSelect,
        }),
        parsed.data.userId,
      );
      await requireMatchingBackupCodeHashFingerprint(
        currentUser.twoFactorBackupCodes,
        parsed.data.expectedBackupCodeHashFingerprint,
      );

      await transaction.appUser.update({
        where: { id: currentUser.id },
        data: { twoFactorBackupCodes: parsed.data.backupCodeHashes },
      });

      await createAdminAuditLog(
        {
          adminUserId: currentUser.id,
          action: "ADMIN_2FA_BACKUP_CREDENTIALS_ROTATED",
          targetType: "AppUser",
          targetId: currentUser.id,
          before: { twoFactorEnabled: true },
          after: { twoFactorEnabled: true },
          meta: { actorRole: UserRole.ADMIN, setupFlow: "INITIAL_SETUP_RECOVERY" },
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
