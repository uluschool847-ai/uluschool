import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1017", "P2024"]);
const RETRY_DELAYS_MS = [200, 500];

function isRetryablePrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(error.code);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("server has closed the connection") ||
      message.includes("connection terminated") ||
      message.includes("terminating connection") ||
      message.includes("connection pool timeout")
    );
  }

  return false;
}

async function withPrismaRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryablePrismaError(error) || attempt >= RETRY_DELAYS_MS.length) {
        throw error;
      }

      const delayMs = RETRY_DELAYS_MS[attempt];
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function findUserByEmail(email: string) {
  return withPrismaRetry(() =>
    prisma.appUser.findUnique({
      where: { email: email.toLowerCase() },
    }),
  );
}

export async function getUsersByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return withPrismaRetry(() =>
    prisma.appUser.findMany({
      where: { id: { in: ids }, isActive: true },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phoneWhatsapp: true,
      },
    }),
  );
}

export async function listUsersByRole(role: UserRole) {
  return withPrismaRetry(() =>
    prisma.appUser.findMany({
      where: { role, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneWhatsapp: true,
      },
      orderBy: { fullName: "asc" },
    }),
  );
}

export async function findAdminUserForTwoFactor(userId: string) {
  return withPrismaRetry(() =>
    prisma.appUser.findFirst({
      where: {
        id: userId,
        role: UserRole.ADMIN,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    }),
  );
}

export async function saveAdminTwoFactorSecret(userId: string, secret: string) {
  return withPrismaRetry(() =>
    prisma.appUser.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
        twoFactorBackupCodes: [],
      },
    }),
  );
}

export async function enableAdminTwoFactor(
  userId: string,
  secret: string,
  backupCodeHashes: string[],
) {
  return withPrismaRetry(() =>
    prisma.appUser.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        twoFactorBackupCodes: backupCodeHashes,
      },
    }),
  );
}

export async function disableAdminTwoFactor(userId: string) {
  return withPrismaRetry(() =>
    prisma.appUser.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    }),
  );
}

export async function consumeAdminBackupCode(userId: string, remainingCodeHashes: string[]) {
  return withPrismaRetry(() =>
    prisma.appUser.update({
      where: { id: userId },
      data: {
        twoFactorBackupCodes: remainingCodeHashes,
      },
    }),
  );
}
