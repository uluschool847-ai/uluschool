import { Prisma, type UserRole } from "@prisma/client";

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
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        passwordHash: true,
        mustChangePassword: true,
        isActive: true,
      },
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
