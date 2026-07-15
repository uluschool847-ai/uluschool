import { Prisma, UserRole } from "@prisma/client";

import { consumeBackupCode, verifyTotpCode } from "@/lib/auth/two-factor";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";

export const ADMIN_TWO_FACTOR_CHALLENGE_DURATION_MS = 10 * 60 * 1000;
export const MAX_ADMIN_TWO_FACTOR_FAILURES = 5;

const MAX_SERIALIZATION_RETRIES = 3;
const MAX_AUTH_METADATA_VALUE_LENGTH = 256;

export type AdminTwoFactorAuthMethod = "password" | "sso";

type AdminTwoFactorVerification = { type: "totp"; code: string } | { type: "backup"; code: string };

type RequestMetadata = {
  userAgent?: string;
};

type CompletionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type AdminTwoFactorChallengeCompletion =
  | { outcome: "success"; user: CompletionUser }
  | { outcome: "failure"; locked: boolean }
  | { outcome: "rejected"; reason: "CHALLENGE_UNAVAILABLE" | "ACCOUNT_UNAVAILABLE" };

function isAuthMethod(value: string): value is AdminTwoFactorAuthMethod {
  return value === "password" || value === "sso";
}

function isSafeIdentifier(value: string) {
  return value.trim() === value && value.length > 0 && value.length <= 191;
}

function isSerializationConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

async function withSerializableRetry<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= MAX_SERIALIZATION_RETRIES) {
        throw error;
      }
    }
  }
}

function toBoundedMetadata(input: {
  authMethod: AdminTwoFactorAuthMethod;
  verificationMethod: AdminTwoFactorVerification["type"];
  requestMetadata?: RequestMetadata;
}) {
  const userAgent = input.requestMetadata?.userAgent
    ?.trim()
    .slice(0, MAX_AUTH_METADATA_VALUE_LENGTH);

  return {
    authMethod: input.authMethod,
    verificationMethod: input.verificationMethod,
    ...(userAgent ? { userAgent } : {}),
  };
}

function rejectedUnavailable(): AdminTwoFactorChallengeCompletion {
  return { outcome: "rejected", reason: "CHALLENGE_UNAVAILABLE" };
}

async function consumeUnavailableChallenge(
  transaction: Prisma.TransactionClient,
  input: { challengeId: string; userId: string; authMethod: AdminTwoFactorAuthMethod },
) {
  await transaction.adminTwoFactorChallenge.updateMany({
    where: {
      id: input.challengeId,
      userId: input.userId,
      authMethod: input.authMethod,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
}

async function recordFailure(
  transaction: Prisma.TransactionClient,
  input: {
    challenge: { id: string; userId: string; authMethod: string; failedAttempts: number };
    verification: AdminTwoFactorVerification;
    requestMetadata?: RequestMetadata;
  },
): Promise<AdminTwoFactorChallengeCompletion> {
  const authMethod = input.challenge.authMethod as AdminTwoFactorAuthMethod;
  const nextFailureCount = input.challenge.failedAttempts + 1;
  const locked = nextFailureCount >= MAX_ADMIN_TWO_FACTOR_FAILURES;
  const now = new Date();
  const updated = await transaction.adminTwoFactorChallenge.updateMany({
    where: {
      id: input.challenge.id,
      userId: input.challenge.userId,
      authMethod,
      failedAttempts: input.challenge.failedAttempts,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      failedAttempts: { increment: 1 },
      ...(locked ? { consumedAt: now } : {}),
    },
  });

  if (updated.count !== 1) {
    return rejectedUnavailable();
  }

  await createAdminAuditLog(
    {
      adminUserId: input.challenge.userId,
      action:
        input.verification.type === "backup"
          ? "ADMIN_LOGIN_2FA_BACKUP_FAILED"
          : "ADMIN_LOGIN_2FA_TOTP_FAILED",
      targetType: "AUTH",
      targetId: input.challenge.userId,
      meta: {
        ...toBoundedMetadata({
          authMethod,
          verificationMethod: input.verification.type,
          requestMetadata: input.requestMetadata,
        }),
        failedAttempts: nextFailureCount,
        locked,
      },
    },
    transaction,
  );

  return { outcome: "failure", locked };
}

export async function startAdminTwoFactorChallenge(input: {
  userId: string;
  authMethod: AdminTwoFactorAuthMethod;
  expiresAt?: Date;
}) {
  if (!isSafeIdentifier(input.userId) || !isAuthMethod(input.authMethod)) {
    throw new Error("Invalid administrator two-factor challenge input.");
  }

  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + ADMIN_TWO_FACTOR_CHALLENGE_DURATION_MS);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new Error("Invalid administrator two-factor challenge expiry.");
  }

  return withSerializableRetry(async (transaction) => {
    const now = new Date();
    await transaction.adminTwoFactorChallenge.updateMany({
      where: {
        userId: input.userId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    return transaction.adminTwoFactorChallenge.create({
      data: {
        userId: input.userId,
        authMethod: input.authMethod,
        failedAttempts: 0,
        expiresAt,
      },
    });
  });
}

export async function completeAdminTwoFactorChallenge(input: {
  userId: string;
  challengeId: string;
  authMethod: AdminTwoFactorAuthMethod;
  verification: AdminTwoFactorVerification;
  requestMetadata?: RequestMetadata;
}): Promise<AdminTwoFactorChallengeCompletion> {
  if (
    !isSafeIdentifier(input.userId) ||
    !isSafeIdentifier(input.challengeId) ||
    !isAuthMethod(input.authMethod) ||
    !input.verification.code.trim()
  ) {
    return rejectedUnavailable();
  }

  return withSerializableRetry(async (transaction) => {
    const now = new Date();
    const challenge = await transaction.adminTwoFactorChallenge.findFirst({
      where: {
        id: input.challengeId,
        userId: input.userId,
        authMethod: input.authMethod,
        consumedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: MAX_ADMIN_TWO_FACTOR_FAILURES },
      },
      select: {
        id: true,
        userId: true,
        authMethod: true,
        failedAttempts: true,
      },
    });

    if (!challenge) {
      return rejectedUnavailable();
    }

    const admin = await transaction.appUser.findFirst({
      where: {
        id: input.userId,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!admin || admin.mustChangePassword || !admin.twoFactorEnabled) {
      await consumeUnavailableChallenge(transaction, input);
      return { outcome: "rejected", reason: "ACCOUNT_UNAVAILABLE" };
    }

    let backupCodes: string[] | null = null;
    let valid = false;
    if (input.verification.type === "totp") {
      if (!admin.twoFactorSecret) {
        await consumeUnavailableChallenge(transaction, input);
        return { outcome: "rejected", reason: "ACCOUNT_UNAVAILABLE" };
      }
      valid = verifyTotpCode(input.verification.code, admin.twoFactorSecret);
    } else {
      const backupResult = await consumeBackupCode({
        providedCode: input.verification.code,
        hashedCodes: admin.twoFactorBackupCodes,
      });
      valid = backupResult.valid;
      backupCodes = backupResult.remaining;
    }

    if (!valid) {
      return recordFailure(transaction, {
        challenge,
        verification: input.verification,
        requestMetadata: input.requestMetadata,
      });
    }

    const consumed = await transaction.adminTwoFactorChallenge.updateMany({
      where: {
        id: challenge.id,
        userId: input.userId,
        authMethod: input.authMethod,
        failedAttempts: challenge.failedAttempts,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      return rejectedUnavailable();
    }

    if (backupCodes) {
      await transaction.appUser.update({
        where: { id: admin.id },
        data: { twoFactorBackupCodes: backupCodes },
      });
    }

    const metadata = toBoundedMetadata({
      authMethod: input.authMethod,
      verificationMethod: input.verification.type,
      requestMetadata: input.requestMetadata,
    });
    await createAdminAuditLog(
      {
        adminUserId: admin.id,
        action:
          input.verification.type === "backup"
            ? "ADMIN_LOGIN_2FA_BACKUP_SUCCESS"
            : "ADMIN_LOGIN_2FA_TOTP_SUCCESS",
        targetType: "AUTH",
        targetId: admin.id,
        meta: metadata,
      },
      transaction,
    );
    await createAdminAuditLog(
      {
        adminUserId: admin.id,
        action: "LOGIN_SUCCESS",
        targetType: "AUTH",
        targetId: admin.id,
        meta: metadata,
      },
      transaction,
    );

    return {
      outcome: "success",
      user: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      },
    };
  });
}
