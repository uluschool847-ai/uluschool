import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { safeCourseMaterialHref } from "@/lib/security/course-material-links";
import { createStorageService } from "@/lib/storage";

type MaterialDatabase = typeof prisma | Prisma.TransactionClient;

export type CourseMaterialAttachmentInput = {
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

export type CourseMaterialFilters = {
  classGroupId?: string | null;
  scheduledClassId?: string | null;
  search?: string | null;
  sort?: "createdAtDesc" | "createdAtAsc" | "title" | "classGroup" | "subject" | string | null;
  subjectId?: string | null;
};

export type StudentCourseMaterialAttachment = {
  filename: string;
  href: string | null;
  mimeType: string;
  size: number;
  storageKey: string;
};

export type StudentCourseMaterial = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  safeFileUrl: string | null;
  attachments: StudentCourseMaterialAttachment[];
  scheduledClassId: string;
  scheduledClass: { id: string; title: string; startAt: Date | null };
  classGroup: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCourseMaterialForTeacherInput = {
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  scheduledClassId?: string | null;
  teacherId: string;
  attachments?: CourseMaterialAttachmentInput[] | null;
};

export type UpdateCourseMaterialForTeacherInput = {
  title?: string;
  description?: string | null;
  fileUrl?: string | null;
  scheduledClassId?: string | null;
  attachments?: CourseMaterialAttachmentInput[] | null;
};

const materialInclude = {
  attachments: true,
  scheduledClass: {
    select: {
      id: true,
      title: true,
      teacherId: true,
      classGroupId: true,
      subject: { select: { id: true, name: true, slug: true } },
      classGroup: { select: { id: true, name: true, teacherId: true } },
    },
  },
} satisfies Prisma.CourseMaterialInclude;

function teacherScheduledClassScope(teacherId: string): Prisma.ScheduledClassWhereInput[] {
  return [{ teacherId }, { classGroup: { teacherId } }];
}

function teacherMaterialScope(teacherId: string): Prisma.CourseMaterialWhereInput[] {
  return [
    { teacherId },
    { scheduledClass: { teacherId } },
    { scheduledClass: { classGroup: { teacherId } } },
  ];
}

function assertTitle(title: string | undefined) {
  if (!title?.trim()) throw new Error("Title is required.");
}

function hasAttachment(input: { attachments?: CourseMaterialAttachmentInput[] | null }) {
  return Array.isArray(input.attachments) && input.attachments.length > 0;
}

export function validateCourseMaterialFileUrl(fileUrl: string | null | undefined) {
  const value = fileUrl?.trim() ?? "";
  if (!value) return null;
  if (value.startsWith("/uploads/")) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("File URL must be a safe HTTPS URL or an internal upload path.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("File URL must be a safe HTTPS URL or an internal upload path.");
  }

  return value;
}

function assertFileUrlOrAttachment(input: {
  attachments?: CourseMaterialAttachmentInput[] | null;
  fileUrl?: string | null;
}) {
  const fileUrl = validateCourseMaterialFileUrl(input.fileUrl);
  if (!fileUrl && !hasAttachment(input)) {
    throw new Error("File URL is required.");
  }
  return fileUrl;
}

function attachmentCreateData(attachments: CourseMaterialAttachmentInput[] | null | undefined) {
  if (!attachments?.length) return undefined;

  return attachments.map((attachment) => ({
    filename: attachment.filename.trim(),
    storageKey: attachment.storageKey.trim(),
    mimeType: attachment.mimeType.trim(),
    size: attachment.size,
  }));
}

function storageKeyPublicUrl(storageKey: string) {
  const normalized = storageKey.replace(/^\/+/, "").replace(/^public[\\\/]/, "");
  return `/${normalized.startsWith("uploads/") ? normalized : `uploads/${normalized}`}`;
}

function attachmentHref(storageKey: string | null | undefined) {
  const trimmed = storageKey?.trim() ?? "";
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^\/+/, "").replace(/^public[\\\/]/, "");
  if (!normalized.startsWith("uploads/")) return null;
  return safeCourseMaterialHref(storageKeyPublicUrl(normalized));
}

function fileUrlFromInput(
  fileUrl: string | null,
  attachments: CourseMaterialAttachmentInput[] | null | undefined,
) {
  if (fileUrl) return fileUrl;
  const firstStorageKey = attachments?.[0]?.storageKey?.trim();
  return firstStorageKey ? storageKeyPublicUrl(firstStorageKey) : "";
}

export async function assertTeacherOwnsMaterialClass(
  teacherId: string,
  scheduledClassId: string,
  database: MaterialDatabase = prisma,
) {
  if (!scheduledClassId.trim()) throw new Error("Scheduled class is required.");

  const scheduledClass = await database.scheduledClass.findFirst({
    where: {
      id: scheduledClassId,
      OR: teacherScheduledClassScope(teacherId),
    },
    select: {
      id: true,
      teacherId: true,
      classGroupId: true,
      classGroup: { select: { id: true, teacherId: true } },
    },
  });

  if (!scheduledClass) {
    throw new Error("Unauthorized: teacher does not own this class.");
  }

  return scheduledClass;
}

export async function assertTeacherOwnsMaterial(
  teacherId: string,
  materialId: string,
  database: MaterialDatabase = prisma,
) {
  const material = await database.courseMaterial.findFirst({
    where: {
      id: materialId,
      OR: teacherMaterialScope(teacherId),
    },
    include: materialInclude,
  });

  if (!material) {
    throw new Error("Material not found or not owned by teacher.");
  }

  return material;
}

export async function createCourseMaterialForTeacher(
  input: CreateCourseMaterialForTeacherInput,
  database: MaterialDatabase = prisma,
) {
  assertTitle(input.title);
  const scheduledClassId = input.scheduledClassId?.trim() ?? "";
  if (!scheduledClassId) throw new Error("Scheduled class is required.");
  const fileUrl = assertFileUrlOrAttachment(input);
  const attachments = attachmentCreateData(input.attachments);
  const scheduledClass = await assertTeacherOwnsMaterialClass(
    input.teacherId,
    scheduledClassId,
    database,
  );

  return database.courseMaterial.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      fileUrl: fileUrlFromInput(fileUrl, input.attachments),
      scheduledClassId: scheduledClass.id,
      teacherId: input.teacherId,
      ...(attachments ? { attachments: { create: attachments } } : {}),
    },
    include: materialInclude,
  });
}

export async function updateCourseMaterialForTeacher(
  id: string,
  teacherId: string,
  input: UpdateCourseMaterialForTeacherInput,
  database: MaterialDatabase = prisma,
) {
  const existing = await assertTeacherOwnsMaterial(teacherId, id, database);
  const data: Prisma.CourseMaterialUpdateInput = {};
  const isReplacingFile = hasAttachment(input);
  const oldStorageKeys = isReplacingFile
    ? existing.attachments.map((attachment) => attachment.storageKey).filter(Boolean)
    : [];

  if (input.title !== undefined) {
    assertTitle(input.title);
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() ?? null;
  }
  if (input.fileUrl !== undefined) {
    const fileUrl = assertFileUrlOrAttachment(input);
    if (fileUrl) data.fileUrl = fileUrl;
  }
  if (isReplacingFile) {
    const attachments = attachmentCreateData(input.attachments);
    if (attachments) {
      data.attachments = { create: attachments };
      data.fileUrl = fileUrlFromInput(
        input.fileUrl !== undefined ? validateCourseMaterialFileUrl(input.fileUrl) : null,
        input.attachments,
      );
    }
  }
  if (input.scheduledClassId !== undefined) {
    const scheduledClassId = input.scheduledClassId?.trim() ?? "";
    if (!scheduledClassId) throw new Error("Scheduled class is required.");
    const scheduledClass = await assertTeacherOwnsMaterialClass(
      teacherId,
      scheduledClassId,
      database,
    );
    data.scheduledClass = { connect: { id: scheduledClass.id } };
  }

  const updated = await database.courseMaterial.update({
    where: { id: existing.id },
    data,
    include: materialInclude,
  });

  if (isReplacingFile && existing.attachments.length > 0) {
    await database.attachment.deleteMany({
      where: {
        id: { in: existing.attachments.map((attachment) => attachment.id) },
        courseMaterialId: existing.id,
      },
    });
  }

  return isReplacingFile
    ? {
        ...updated,
        cleanup: {
          queued: oldStorageKeys.length > 0,
          deleted: 0,
          storageKeys: oldStorageKeys,
        },
      }
    : updated;
}

export async function getCourseMaterialForTeacher(
  id: string,
  teacherId: string,
  database: MaterialDatabase = prisma,
) {
  return database.courseMaterial.findFirst({
    where: {
      id,
      OR: teacherMaterialScope(teacherId),
    },
    include: materialInclude,
  });
}

export async function listCourseMaterialsForTeacher(
  teacherId: string,
  filters: CourseMaterialFilters = {},
  database: MaterialDatabase = prisma,
) {
  return database.courseMaterial.findMany({
    where: {
      OR: teacherMaterialScope(teacherId),
      ...(filters.scheduledClassId ? { scheduledClassId: filters.scheduledClassId } : {}),
      ...(filters.classGroupId ? { scheduledClass: { classGroupId: filters.classGroupId } } : {}),
      ...(filters.subjectId ? { scheduledClass: { subjectId: filters.subjectId } } : {}),
      ...(filters.search
        ? {
            title: {
              contains: filters.search,
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    include: materialInclude,
    orderBy: [{ createdAt: "desc" }, { title: "asc" }],
  });
}

export async function listCourseMaterialsForTeacherClass(
  teacherId: string,
  scheduledClassId: string,
  database: MaterialDatabase = prisma,
) {
  const scheduledClass = await assertTeacherOwnsMaterialClass(
    teacherId,
    scheduledClassId,
    database,
  );

  return database.courseMaterial.findMany({
    where: {
      scheduledClassId: scheduledClass.id,
      OR: teacherMaterialScope(teacherId),
    },
    include: materialInclude,
    orderBy: [{ createdAt: "desc" }, { title: "asc" }],
  });
}

export async function deleteCourseMaterialForTeacher(
  id: string,
  teacherId: string,
  database: MaterialDatabase = prisma,
) {
  const existing = await database.courseMaterial.findFirst({
    where: {
      id,
      OR: teacherMaterialScope(teacherId),
    },
    include: {
      ...materialInclude,
      attachments: true,
    },
  });

  if (!existing) {
    throw new Error("Material not found or not owned by teacher.");
  }

  const storageKeys = existing.attachments
    .map((attachment) => attachment.storageKey)
    .filter(Boolean);

  await database.courseMaterial.delete({ where: { id: existing.id } });

  const storage = createStorageService();
  let deleted = 0;
  for (const storageKey of storageKeys) {
    await storage.delete(storageKey);
    deleted += 1;
  }

  return {
    ...existing,
    success: true as const,
    cleanup: {
      queued: storageKeys.length > 0,
      deleted,
      storageKeys,
    },
  };
}

export async function unlinkCourseMaterialAttachmentForTeacher(
  teacherId: string,
  materialId: string,
  attachmentId: string,
  database: MaterialDatabase = prisma,
) {
  await assertTeacherOwnsMaterial(teacherId, materialId, database);

  const attachment = await database.attachment.findFirst({
    where: {
      id: attachmentId,
      courseMaterialId: materialId,
    },
  });

  if (!attachment) {
    throw new Error("Material attachment not found or not owned by teacher.");
  }

  await database.attachment.delete({
    where: { id: attachment.id },
  });

  return {
    attachmentId: attachment.id,
    materialId,
    storageKey: attachment.storageKey,
  };
}

export async function listStudentCourseMaterials(
  studentId: string,
  filters: CourseMaterialFilters = {},
  database: MaterialDatabase = prisma,
) {
  const search = filters.search?.trim();
  const where: Prisma.CourseMaterialWhereInput = {
    scheduledClass: {
      OR: [
        { students: { some: { id: studentId } } },
        { classGroup: { students: { some: { id: studentId } } } },
      ],
      ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    ...(filters.scheduledClassId ? { scheduledClassId: filters.scheduledClassId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { scheduledClass: { title: { contains: search, mode: "insensitive" as const } } },
            {
              scheduledClass: {
                classGroup: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
            {
              scheduledClass: {
                subject: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.CourseMaterialOrderByWithRelationInput[] =
    filters.sort === "createdAtAsc"
      ? [{ createdAt: "asc" }, { title: "asc" }]
      : filters.sort === "title"
        ? [{ title: "asc" }]
        : filters.sort === "classGroup"
          ? [{ scheduledClass: { classGroup: { name: "asc" } } }, { title: "asc" }]
          : filters.sort === "subject"
            ? [{ scheduledClass: { subject: { name: "asc" } } }, { title: "asc" }]
            : [{ createdAt: "desc" }, { title: "asc" }];

  const materials = await database.courseMaterial.findMany({
    where,
    include: {
      attachments: true,
      scheduledClass: {
        select: {
          id: true,
          title: true,
          startAt: true,
          subject: { select: { id: true, name: true, slug: true } },
          classGroup: { select: { id: true, name: true } },
        },
      },
    },
    orderBy,
  });

  return materials.map((material): StudentCourseMaterial => {
    const scheduledClass = material.scheduledClass;
    return {
      id: material.id,
      title: material.title,
      description: material.description ?? null,
      fileUrl: material.fileUrl,
      safeFileUrl: safeCourseMaterialHref(material.fileUrl),
      attachments: material.attachments.map((attachment) => ({
        filename: attachment.filename,
        href: attachmentHref(attachment.storageKey),
        mimeType: attachment.mimeType,
        size: attachment.size,
        storageKey: attachment.storageKey,
      })),
      scheduledClassId: material.scheduledClassId,
      scheduledClass: {
        id: scheduledClass.id,
        title: scheduledClass.title,
        startAt: scheduledClass.startAt,
      },
      classGroup: scheduledClass.classGroup
        ? { id: scheduledClass.classGroup.id, name: scheduledClass.classGroup.name }
        : null,
      subject: scheduledClass.subject
        ? { id: scheduledClass.subject.id, name: scheduledClass.subject.name }
        : null,
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
    };
  });
}

export async function listParentChildCourseMaterials(
  parentId: string,
  studentId: string,
  filters: CourseMaterialFilters = {},
  database: MaterialDatabase = prisma,
) {
  const linkedChildScope = {
    id: studentId,
    parents: { some: { id: parentId } },
  };

  return database.courseMaterial.findMany({
    where: {
      scheduledClass: {
        OR: [
          { students: { some: linkedChildScope } },
          { classGroup: { students: { some: linkedChildScope } } },
        ],
        ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      },
      ...(filters.scheduledClassId ? { scheduledClassId: filters.scheduledClassId } : {}),
      ...(filters.search
        ? { title: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    },
    include: {
      scheduledClass: {
        select: {
          id: true,
          title: true,
          subject: { select: { id: true, name: true, slug: true } },
          classGroup: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { title: "asc" }],
  });
}
