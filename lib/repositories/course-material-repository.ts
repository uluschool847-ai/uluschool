import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { safeCourseMaterialHref } from "@/lib/security/course-material-links";
import { isTeacherMaterialStorageKey, validateLegacyStorageKey } from "@/lib/storage/storage-key";
import {
  legacyStorageKeyFromUrl,
  storageKeyFromUrl,
  storageUrlForKey,
  storageUrlMatchesKey,
} from "@/lib/storage/storage-url";

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

export function validateCourseMaterialFileUrl(
  fileUrl: string | null | undefined,
  options: { allowTrustedLegacy?: boolean } = {},
) {
  const value = fileUrl?.trim() ?? "";
  if (!value) return null;
  if (value.startsWith("/uploads/") || value.startsWith("/public/uploads/")) {
    if (!options.allowTrustedLegacy) {
      throw new Error("Legacy upload URLs cannot be submitted as new material files.");
    }
    legacyStorageKeyFromUrl(value);
    return value;
  }
  if (value.startsWith("/api/")) {
    storageKeyFromUrl(value);
    return value;
  }

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
  if (fileUrl?.startsWith("/api/") && !hasAttachment(input)) {
    throw new Error("Internal upload URLs require matching attachment metadata.");
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

function assertTeacherOwnsAttachmentInputs(
  attachments: CourseMaterialAttachmentInput[] | null | undefined,
  teacherId: string,
  fileUrl: string | null,
) {
  if (!attachments?.length) return;
  const storageKeys = new Set<string>();
  for (const attachment of attachments) {
    if (!isTeacherMaterialStorageKey(attachment.storageKey, teacherId)) {
      throw new Error("Uploaded file is not owned by this teacher.");
    }
    const storageKey = attachment.storageKey.trim();
    if (storageKeys.has(storageKey)) {
      throw new Error("Duplicate attachment storage key.");
    }
    storageKeys.add(storageKey);
  }
  if (fileUrl && !storageUrlMatchesKey(fileUrl, attachments[0].storageKey)) {
    throw new Error("Uploaded file URL does not match its storage key.");
  }
}

async function assertAttachmentInputKeysAvailable(
  attachments: CourseMaterialAttachmentInput[] | null | undefined,
  database: MaterialDatabase,
  excludedAttachmentIds: string[] = [],
) {
  if (!attachments?.length) return;
  const storageKeys = attachments.map((attachment) => attachment.storageKey.trim());
  const existing = await database.attachment.findMany({
    where: {
      storageKey: { in: storageKeys },
      ...(excludedAttachmentIds.length > 0 ? { id: { notIn: excludedAttachmentIds } } : {}),
    },
    select: { storageKey: true },
  });
  if (existing.length > 0) {
    throw new Error("Uploaded file is already attached to another record.");
  }
}

function validateStoredCleanupKey(storageKey: unknown, teacherId: string) {
  if (typeof storageKey !== "string") {
    throw new Error("Uploaded file is not owned by this teacher.");
  }
  if (isTeacherMaterialStorageKey(storageKey, teacherId)) return storageKey;
  try {
    return validateLegacyStorageKey(storageKey);
  } catch {
    throw new Error("Uploaded file is not owned by this teacher.");
  }
}

function validateStoredCleanupKeys(attachments: Array<{ storageKey: unknown }>, teacherId: string) {
  return attachments.map((attachment) =>
    validateStoredCleanupKey(attachment.storageKey, teacherId),
  );
}

async function findOrphanStorageKeys(storageKeys: string[], database: MaterialDatabase) {
  const uniqueStorageKeys = [...new Set(storageKeys)];
  if (uniqueStorageKeys.length === 0) return [];
  const remainingReferences = await database.attachment.findMany({
    where: { storageKey: { in: uniqueStorageKeys } },
    select: { storageKey: true },
  });
  const referencedStorageKeys = new Set(
    remainingReferences.map((attachment) => attachment.storageKey),
  );
  return uniqueStorageKeys.filter((storageKey) => !referencedStorageKeys.has(storageKey));
}

function validateUpdateFileUrl(
  fileUrl: string | null,
  existingFileUrl: string,
  hasReplacement: boolean,
) {
  const value = fileUrl?.trim() ?? "";
  if (!value) {
    if (hasReplacement) return null;
    throw new Error("File URL is required.");
  }
  if (value.startsWith("/uploads/") || value.startsWith("/public/uploads/")) {
    const legacyUrl = validateCourseMaterialFileUrl(value, { allowTrustedLegacy: true });
    if (legacyUrl !== existingFileUrl.trim()) {
      throw new Error("Legacy upload URLs cannot be submitted as new material files.");
    }
    return legacyUrl;
  }
  const validatedFileUrl = validateCourseMaterialFileUrl(value);
  if (
    validatedFileUrl?.startsWith("/api/") &&
    !hasReplacement &&
    validatedFileUrl !== existingFileUrl.trim()
  ) {
    throw new Error("Internal upload URLs require matching attachment metadata.");
  }
  return validatedFileUrl;
}

function storageKeyPublicUrl(storageKey: string) {
  const normalized = storageKey.replace(/^\/+/, "").replace(/^public[\\\/]/, "");
  return `/${normalized.startsWith("uploads/") ? normalized : `uploads/${normalized}`}`;
}

function attachmentHref(storageKey: string | null | undefined) {
  const trimmed = storageKey?.trim() ?? "";
  if (!trimmed) return null;
  try {
    return storageUrlForKey(trimmed);
  } catch {
    try {
      return safeCourseMaterialHref(storageKeyPublicUrl(validateLegacyStorageKey(trimmed)));
    } catch {
      return null;
    }
  }
}

function fileUrlFromInput(
  fileUrl: string | null,
  attachments: CourseMaterialAttachmentInput[] | null | undefined,
) {
  const firstStorageKey = attachments?.[0]?.storageKey?.trim();
  if (firstStorageKey) return storageUrlForKey(firstStorageKey);
  return fileUrl ?? "";
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
  assertTeacherOwnsAttachmentInputs(input.attachments, input.teacherId, fileUrl);
  const attachments = attachmentCreateData(input.attachments);
  const scheduledClass = await assertTeacherOwnsMaterialClass(
    input.teacherId,
    scheduledClassId,
    database,
  );
  await assertAttachmentInputKeysAvailable(input.attachments, database);

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
  const validatedStoredKeys = validateStoredCleanupKeys(existing.attachments, teacherId);
  const oldStorageKeys = isReplacingFile ? validatedStoredKeys : [];
  const validatedFileUrl =
    input.fileUrl === undefined
      ? null
      : validateUpdateFileUrl(input.fileUrl, existing.fileUrl, isReplacingFile);

  if (isReplacingFile) {
    assertTeacherOwnsAttachmentInputs(input.attachments, teacherId, validatedFileUrl);
  }

  if (input.title !== undefined) {
    assertTitle(input.title);
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() ?? null;
  }
  if (input.fileUrl !== undefined) {
    if (validatedFileUrl) data.fileUrl = validatedFileUrl;
  }
  if (isReplacingFile) {
    const attachments = attachmentCreateData(input.attachments);
    if (attachments) {
      data.attachments = { create: attachments };
      data.fileUrl = fileUrlFromInput(validatedFileUrl, input.attachments);
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

  if (isReplacingFile) {
    await assertAttachmentInputKeysAvailable(
      input.attachments,
      database,
      existing.attachments.map((attachment) => attachment.id),
    );
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

  if (!isReplacingFile) return updated;

  const finalMaterial = await database.courseMaterial.findUnique({
    where: { id: existing.id },
    include: materialInclude,
  });
  if (!finalMaterial) throw new Error("Material not found after update.");
  const orphanStorageKeys = await findOrphanStorageKeys(oldStorageKeys, database);
  return {
    ...finalMaterial,
    cleanup: {
      queued: orphanStorageKeys.length > 0,
      deleted: 0,
      storageKeys: orphanStorageKeys,
    },
  };
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

  const storageKeys = validateStoredCleanupKeys(existing.attachments, teacherId);

  await database.courseMaterial.delete({ where: { id: existing.id } });
  const orphanStorageKeys = await findOrphanStorageKeys(storageKeys, database);

  return {
    ...existing,
    success: true as const,
    cleanup: {
      queued: orphanStorageKeys.length > 0,
      deleted: 0,
      storageKeys: orphanStorageKeys,
    },
  };
}

export async function unlinkCourseMaterialAttachmentForTeacher(
  teacherId: string,
  materialId: string,
  attachmentId: string,
  database: MaterialDatabase = prisma,
) {
  const material = await assertTeacherOwnsMaterial(teacherId, materialId, database);
  validateStoredCleanupKeys(material.attachments, teacherId);

  const attachment = await database.attachment.findFirst({
    where: {
      id: attachmentId,
      courseMaterialId: materialId,
    },
  });

  if (!attachment) {
    throw new Error("Material attachment not found or not owned by teacher.");
  }

  const storageKey = validateStoredCleanupKey(attachment.storageKey, teacherId);

  await database.attachment.delete({
    where: { id: attachment.id },
  });

  const finalMaterial = await database.courseMaterial.findUnique({
    where: { id: material.id },
    include: materialInclude,
  });
  if (!finalMaterial) throw new Error("Material not found after unlinking attachment.");
  const orphanStorageKeys = await findOrphanStorageKeys([storageKey], database);

  return {
    ...finalMaterial,
    attachmentId: attachment.id,
    materialId,
    storageKey,
    cleanup: {
      queued: orphanStorageKeys.length > 0,
      deleted: 0,
      storageKeys: orphanStorageKeys,
    },
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
