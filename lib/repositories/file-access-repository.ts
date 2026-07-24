import { type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { validateStorageKey } from "@/lib/storage/storage-key";
import { storageUrlForKey } from "@/lib/storage/storage-url";

type FileAccessDatabase = typeof prisma | Prisma.TransactionClient;

export type FileAccessSession = {
  uid: string;
  role: UserRole;
};

function isFileAccessSession(session: unknown): session is FileAccessSession {
  if (typeof session !== "object" || session === null) return false;

  const candidate = session as Record<string, unknown>;
  return (
    typeof candidate.uid === "string" &&
    candidate.uid.length > 0 &&
    candidate.uid.length <= 191 &&
    candidate.uid === candidate.uid.trim() &&
    Object.values(UserRole).includes(candidate.role as UserRole)
  );
}

function validateKeyRoot(storageKey: string, root: "private" | "public") {
  try {
    const validStorageKey = validateStorageKey(storageKey);
    return validStorageKey.startsWith(`${root}/`) ? validStorageKey : null;
  } catch {
    return null;
  }
}

async function canAdminAccess(storageKey: string, database: FileAccessDatabase) {
  const attachment = await database.attachment.findFirst({
    where: { storageKey },
    select: { id: true },
  });
  if (attachment) return true;

  const report = await database.reportSnapshot.findFirst({
    where: { pdfStorageKey: storageKey },
    select: { id: true },
  });
  return Boolean(report);
}

async function canTeacherAccess(
  teacherId: string,
  storageKey: string,
  database: FileAccessDatabase,
) {
  const teacherOwnership = [
    { teacherId },
    { scheduledClass: { is: { teacherId } } },
    { scheduledClass: { is: { classGroup: { is: { teacherId } } } } },
  ];
  const attachment = await database.attachment.findFirst({
    where: {
      storageKey,
      OR: [
        { courseMaterial: { is: { OR: teacherOwnership } } },
        {
          submission: {
            is: { assignment: { is: { OR: teacherOwnership } } },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (attachment) return true;

  const report = await database.reportSnapshot.findFirst({
    where: { pdfStorageKey: storageKey, generatedByTeacherId: teacherId },
    select: { id: true },
  });
  return Boolean(report);
}

async function canStudentAccess(
  studentId: string,
  storageKey: string,
  database: FileAccessDatabase,
) {
  const attachment = await database.attachment.findFirst({
    where: {
      storageKey,
      OR: [
        { submission: { is: { studentId } } },
        {
          courseMaterial: {
            is: {
              scheduledClass: {
                is: {
                  OR: [
                    { students: { some: { id: studentId } } },
                    {
                      classGroup: {
                        is: { students: { some: { id: studentId } } },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (attachment) return true;

  const report = await database.reportSnapshot.findFirst({
    where: { pdfStorageKey: storageKey, studentId },
    select: { id: true },
  });
  return Boolean(report);
}

async function canParentAccess(parentId: string, storageKey: string, database: FileAccessDatabase) {
  const linkedChild = { parents: { some: { id: parentId } } };
  const attachment = await database.attachment.findFirst({
    where: {
      storageKey,
      OR: [
        { submission: { is: { student: { is: linkedChild } } } },
        {
          courseMaterial: {
            is: {
              scheduledClass: {
                is: {
                  OR: [
                    { students: { some: linkedChild } },
                    {
                      classGroup: {
                        is: { students: { some: linkedChild } },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (attachment) return true;

  const report = await database.reportSnapshot.findFirst({
    where: {
      pdfStorageKey: storageKey,
      student: { is: { parents: { some: { id: parentId } } } },
    },
    select: { id: true },
  });
  return Boolean(report);
}

export async function canAccessPrivateStorageKey(
  session: FileAccessSession,
  storageKey: string,
  database: FileAccessDatabase = prisma,
) {
  const validStorageKey = validateKeyRoot(storageKey, "private");
  if (!validStorageKey || !isFileAccessSession(session)) return false;

  switch (session.role) {
    case UserRole.ADMIN:
      return canAdminAccess(validStorageKey, database);
    case UserRole.TEACHER:
      return canTeacherAccess(session.uid, validStorageKey, database);
    case UserRole.STUDENT:
      return canStudentAccess(session.uid, validStorageKey, database);
    case UserRole.PARENT:
      return canParentAccess(session.uid, validStorageKey, database);
    default:
      return false;
  }
}

export async function isPublishedTeacherPhoto(
  storageKey: string,
  database: FileAccessDatabase = prisma,
) {
  const validStorageKey = validateKeyRoot(storageKey, "public");
  if (!validStorageKey) return false;

  const teacher = await database.teacher.findFirst({
    where: {
      isActive: true,
      photoUrl: storageUrlForKey(validStorageKey),
    },
    select: { id: true },
  });
  return Boolean(teacher);
}
