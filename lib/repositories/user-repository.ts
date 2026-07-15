import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";

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

export async function findUserById(userId: string) {
  return withPrismaRetry(() =>
    prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        learningStatus: true,
        phoneWhatsapp: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

export async function findUserForInitialSetup(userId: string) {
  return withPrismaRetry(() =>
    prisma.appUser.findUnique({
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
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
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
        role: true,
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

export async function enableAdminTwoFactorWithAudit(input: {
  userId: string;
  actorId: string;
  secret: string;
  backupCodeHashes: string[];
}) {
  return prisma.$transaction(
    async (transaction) => {
      const admin = await transaction.appUser.findFirst({
        where: {
          id: input.userId,
          role: UserRole.ADMIN,
          isActive: true,
        },
        select: {
          id: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
        },
      });
      if (!admin || input.actorId !== admin.id || admin.twoFactorSecret !== input.secret) {
        throw new Error("Administrator two-factor setup state is invalid.");
      }

      await transaction.appUser.update({
        where: { id: admin.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: input.secret,
          twoFactorBackupCodes: input.backupCodeHashes,
        },
      });
      await createAdminAuditLog(
        {
          adminUserId: input.actorId,
          action: "ADMIN_2FA_ENABLED",
          targetType: "AppUser",
          targetId: admin.id,
          before: { twoFactorEnabled: admin.twoFactorEnabled },
          after: { twoFactorEnabled: true },
          meta: { actorRole: UserRole.ADMIN },
        },
        transaction,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function disableAdminTwoFactorWithAudit(input: { userId: string; actorId: string }) {
  return prisma.$transaction(
    async (transaction) => {
      const admin = await transaction.appUser.findFirst({
        where: {
          id: input.userId,
          role: UserRole.ADMIN,
          isActive: true,
        },
        select: {
          id: true,
          twoFactorEnabled: true,
        },
      });
      if (!admin || input.actorId !== admin.id || !admin.twoFactorEnabled) {
        throw new Error("Administrator two-factor setup state is invalid.");
      }

      await transaction.appUser.update({
        where: { id: admin.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: [],
        },
      });
      await createAdminAuditLog(
        {
          adminUserId: input.actorId,
          action: "ADMIN_2FA_DISABLED",
          targetType: "AppUser",
          targetId: admin.id,
          before: { twoFactorEnabled: true },
          after: { twoFactorEnabled: false },
          meta: { actorRole: UserRole.ADMIN },
        },
        transaction,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
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

export async function getChildren(parentId: string) {
  return withPrismaRetry(async () => {
    const parent = await prisma.appUser.findUnique({
      where: { id: parentId },
      include: { children: true },
    });
    return parent?.children || [];
  });
}

export async function getStudentProfile(studentId: string) {
  return withPrismaRetry(async () => {
    const student = await prisma.appUser.findUnique({
      where: { id: studentId },
      include: {
        enrolledClasses: true,
        submissions: {
          include: { assignment: true },
          orderBy: { submittedAt: "desc" },
          take: 5,
        },
      },
    });

    if (!student) throw new Error("Student not found");

    return {
      student: { id: student.id, role: student.role, name: student.fullName },
      enrolledClasses: student.enrolledClasses,
      recentSubmissions: student.submissions,
    };
  });
}
