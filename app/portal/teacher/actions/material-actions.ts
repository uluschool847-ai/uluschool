"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createCourseMaterialForTeacher,
  deleteCourseMaterialForTeacher,
  unlinkCourseMaterialAttachmentForTeacher,
  updateCourseMaterialForTeacher,
  validateCourseMaterialFileUrl,
} from "@/lib/repositories/course-material-repository";
import { releasePendingUpload } from "@/lib/repositories/pending-upload-repository";
import {
  createStorageService,
  isTeacherMaterialStorageKey,
  storageUrlMatchesKey,
  validateLegacyStorageKey,
} from "@/lib/storage";

const fileUrlSchema = z
  .string()
  .trim()
  .min(1, "File URL is required")
  .superRefine((value, ctx) => {
    try {
      validateCourseMaterialFileUrl(value, { allowTrustedLegacy: true });
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          error instanceof Error
            ? error.message
            : "File URL must be a safe HTTPS URL or an internal upload path.",
      });
    }
  });

const attachmentSchema = z.object({
  filename: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().int().positive(),
});

const submitCourseMaterialSchema = z.object({
  _redirectToList: z.boolean().optional(),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  fileUrl: fileUrlSchema,
  scheduledClassId: z.string().trim().min(1, "Scheduled class ID is required"),
  attachment: attachmentSchema.optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const updateCourseMaterialSchema = z.object({
  _redirectToList: z.boolean().optional(),
  title: z.string().trim().min(1, "Title is required").optional(),
  description: z.string().trim().optional(),
  fileUrl: fileUrlSchema.optional(),
  scheduledClassId: z.string().trim().min(1, "Scheduled class ID is required").optional(),
  attachment: attachmentSchema.optional(),
  attachments: z.array(attachmentSchema).optional(),
});

type ActionResult<T> =
  | { success: true; data: T; cleanup?: unknown }
  | { success: false; error: string | Record<string, string[] | undefined> };

type MaterialAuditSource = {
  id?: string | null;
  scheduledClassId?: string | null;
  scheduledClass?: {
    id?: string | null;
    classGroupId?: string | null;
    classGroup?: { id?: string | null } | null;
  };
  classGroupId?: string | null;
};

const MATERIAL_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

function affectedClassGroupId(source: MaterialAuditSource | null | undefined) {
  return (
    source?.scheduledClass?.classGroup?.id ??
    source?.scheduledClass?.classGroupId ??
    source?.classGroupId ??
    null
  );
}

function affectedLessonId(source: MaterialAuditSource | null | undefined) {
  return source?.scheduledClass?.id ?? source?.scheduledClassId ?? null;
}

function revalidateMaterialPaths(source: MaterialAuditSource | null | undefined) {
  const classGroupId = affectedClassGroupId(source);
  const lessonId = affectedLessonId(source);

  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/classes");
  if (classGroupId) revalidatePath(`/portal/teacher/classes/${classGroupId}`);
  if (lessonId) revalidatePath(`/portal/teacher/lessons/${lessonId}`);
  revalidatePath("/portal/teacher/materials");
  revalidatePath("/portal/student");
  revalidatePath("/portal/student/materials");
  revalidatePath("/portal/parent");
}

function revalidateMaterialPathsBestEffort(source: MaterialAuditSource | null | undefined) {
  try {
    revalidateMaterialPaths(source);
  } catch {
    // Mutation and audit are already committed; cache invalidation must not change that result.
  }
}

async function writeMaterialAudit(
  input: {
    teacherId: string;
    action: string;
    targetType?: string;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
    meta?: Record<string, unknown>;
  },
  database: NonNullable<Parameters<typeof createAdminAuditLog>[1]>,
) {
  const payload = {
    adminUserId: input.teacherId,
    actorId: input.teacherId,
    action: input.action,
    targetType: input.targetType ?? "course_material",
    targetId: input.targetId ?? null,
    before: input.before,
    after: input.after,
    meta: { teacherId: input.teacherId, ...input.meta },
  };

  await createAdminAuditLog(payload, database);
}

function materialMeta(teacherId: string, material: MaterialAuditSource | null | undefined) {
  return {
    teacherId,
    materialId: material?.id ?? null,
    scheduledClassId: affectedLessonId(material),
    classGroupId: affectedClassGroupId(material),
  };
}

function normalizeAttachments(input: {
  attachment?: z.infer<typeof attachmentSchema>;
  attachments?: Array<z.infer<typeof attachmentSchema>>;
}) {
  return input.attachments ?? (input.attachment ? [input.attachment] : undefined);
}

const STORAGE_OWNERSHIP_ERROR = "Uploaded file is not owned by this teacher.";

function assertTeacherOwnsStorageKeys(storageKeys: unknown, teacherId: string) {
  if (!Array.isArray(storageKeys)) return;
  for (const storageKey of storageKeys) {
    if (typeof storageKey !== "string" || !isTeacherMaterialStorageKey(storageKey, teacherId)) {
      throw new Error(STORAGE_OWNERSHIP_ERROR);
    }
  }
}

function assertTeacherOwnsAttachments(
  attachments: Array<{ storageKey: string }> | undefined,
  teacherId: string,
) {
  assertTeacherOwnsStorageKeys(
    attachments?.map((attachment) => attachment.storageKey),
    teacherId,
  );
}

function assertAttachmentUrlMatchesStorageKey(
  fileUrl: string | undefined,
  attachments: Array<{ storageKey: string }> | undefined,
) {
  if (!attachments?.length) return;
  if (!fileUrl || !storageUrlMatchesKey(fileUrl, attachments[0].storageKey)) {
    throw new Error("Uploaded file URL does not match its storage key.");
  }
}

function trustedCleanupKey(value: unknown, teacherId: string) {
  if (typeof value !== "string") return null;
  if (isTeacherMaterialStorageKey(value, teacherId)) return value;
  try {
    return validateLegacyStorageKey(value);
  } catch {
    return null;
  }
}

async function cleanupStorageKeysBestEffort(storageKeys: unknown, teacherId: string) {
  if (!Array.isArray(storageKeys) || storageKeys.length === 0) {
    return { attempted: 0, deleted: 0, failed: 0 };
  }

  const validatedKeys = storageKeys.map((storageKey) => trustedCleanupKey(storageKey, teacherId));
  const keys = [
    ...new Set(validatedKeys.filter((storageKey): storageKey is string => Boolean(storageKey))),
  ];
  const invalidKeyCount = validatedKeys.filter((storageKey) => !storageKey).length;
  if (keys.length === 0) return { attempted: 0, deleted: 0, failed: invalidKeyCount, retained: 0 };

  let storage: ReturnType<typeof createStorageService>;
  try {
    storage = createStorageService();
  } catch {
    return {
      attempted: keys.length,
      deleted: 0,
      failed: keys.length + invalidKeyCount,
      retained: 0,
    };
  }

  let deleted = 0;
  let failed = invalidKeyCount;
  let retained = 0;
  for (const storageKey of keys) {
    try {
      const result = await releasePendingUpload({ ownerId: teacherId, storageKey, storage });
      if (result.deleted) deleted += 1;
      else if (result.referenced) retained += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { attempted: keys.length, deleted, failed, retained };
}

async function releasePendingMaterialUploadsBestEffort(
  attachments: Array<{ storageKey: string }> | undefined,
  teacherId: string,
) {
  if (!attachments?.length) return;

  let storage: ReturnType<typeof createStorageService>;
  try {
    storage = createStorageService();
  } catch {
    return;
  }

  for (const attachment of attachments) {
    try {
      await releasePendingUpload({
        ownerId: teacherId,
        storageKey: attachment.storageKey,
        storage,
      });
    } catch {
      // Cleanup cannot replace the original material transaction failure.
    }
  }
}

export async function submitCourseMaterialAction(
  data: unknown,
): Promise<ActionResult<{ id: string; title: string }>> {
  let pendingAttachments: Array<z.infer<typeof attachmentSchema>> | undefined;
  let pendingOwnerId: string | null = null;
  let materialTransactionStarted = false;
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = submitCourseMaterialSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const attachments = normalizeAttachments(parsed.data);
    assertTeacherOwnsAttachments(attachments, session.uid);
    assertAttachmentUrlMatchesStorageKey(parsed.data.fileUrl, attachments);
    if (parsed.data.fileUrl.startsWith("/api/") && !attachments?.length) {
      throw new Error("Internal upload URLs require matching attachment metadata.");
    }
    if (
      parsed.data.fileUrl.startsWith("/uploads/") ||
      parsed.data.fileUrl.startsWith("/public/uploads/")
    ) {
      throw new Error("Legacy upload URLs cannot be submitted as new material files.");
    }

    pendingAttachments = attachments;
    pendingOwnerId = session.uid;
    materialTransactionStarted = true;
    const material = await prisma.$transaction(async (transaction) => {
      const created = await createCourseMaterialForTeacher(
        {
          title: parsed.data.title,
          description: parsed.data.description,
          fileUrl: parsed.data.fileUrl,
          scheduledClassId: parsed.data.scheduledClassId,
          teacherId: session.uid,
          attachments,
        },
        transaction,
      );

      await writeMaterialAudit(
        {
          teacherId: session.uid,
          action: "COURSE_MATERIAL_CREATED",
          targetId: created.id,
          before: null,
          after: created,
          meta: materialMeta(session.uid, created),
        },
        transaction,
      );
      if (attachments?.length) {
        await writeMaterialAudit(
          {
            teacherId: session.uid,
            action: "COURSE_MATERIAL_FILE_UPLOADED",
            targetType: "course_material_attachment",
            targetId: attachments[0]?.storageKey ?? null,
            before: null,
            after: attachments,
            meta: {
              ...materialMeta(session.uid, created),
              storageKey: attachments[0]?.storageKey ?? null,
              filename: attachments[0]?.filename ?? null,
              mimeType: attachments[0]?.mimeType ?? null,
              size: attachments[0]?.size ?? null,
            },
          },
          transaction,
        );
      }
      return created;
    }, MATERIAL_TRANSACTION_OPTIONS);
    revalidateMaterialPathsBestEffort(material);

    if (parsed.data._redirectToList) {
      redirect("/portal/teacher/materials");
    }

    return { success: true, data: { id: material.id, title: material.title } };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;
    if (materialTransactionStarted && pendingOwnerId) {
      await releasePendingMaterialUploadsBestEffort(pendingAttachments, pendingOwnerId);
    }
    const message = error instanceof Error ? error.message : "Failed to create material";
    return { success: false, error: message };
  }
}

export async function submitCourseMaterial(
  data: unknown,
): Promise<ActionResult<{ id: string; title: string }>> {
  return submitCourseMaterialAction(data);
}

export async function updateCourseMaterialAction(
  id: string,
  data: unknown,
): Promise<ActionResult<{ id: string; title: string }>> {
  let pendingAttachments: Array<z.infer<typeof attachmentSchema>> | undefined;
  let pendingOwnerId: string | null = null;
  let materialTransactionStarted = false;
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = updateCourseMaterialSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const attachments = normalizeAttachments(parsed.data);
    assertTeacherOwnsAttachments(attachments, session.uid);
    assertAttachmentUrlMatchesStorageKey(parsed.data.fileUrl, attachments);
    pendingAttachments = attachments;
    pendingOwnerId = session.uid;
    materialTransactionStarted = true;
    const material = await prisma.$transaction(async (transaction) => {
      const updated = await updateCourseMaterialForTeacher(
        id,
        session.uid,
        {
          ...parsed.data,
          attachments,
        },
        transaction,
      );

      await writeMaterialAudit(
        {
          teacherId: session.uid,
          action: "COURSE_MATERIAL_UPDATED",
          targetId: updated.id,
          before: null,
          after: updated,
          meta: materialMeta(session.uid, updated),
        },
        transaction,
      );
      if (attachments?.length) {
        const cleanup = (updated as { cleanup?: { storageKeys?: string[] } }).cleanup;
        await writeMaterialAudit(
          {
            teacherId: session.uid,
            action: "COURSE_MATERIAL_FILE_REPLACED",
            targetId: updated.id,
            before: null,
            after: attachments,
            meta: {
              ...materialMeta(session.uid, updated),
              oldStorageKeys: cleanup?.storageKeys ?? [],
              storageKey: attachments[0]?.storageKey ?? null,
            },
          },
          transaction,
        );
      }
      return updated;
    }, MATERIAL_TRANSACTION_OPTIONS);
    const cleanup = attachments?.length
      ? await cleanupStorageKeysBestEffort(
          (material as { cleanup?: { storageKeys?: string[] } }).cleanup?.storageKeys,
          session.uid,
        )
      : undefined;
    revalidateMaterialPathsBestEffort(material);

    if (parsed.data._redirectToList) {
      redirect("/portal/teacher/materials");
    }

    return { success: true, data: { id: material.id, title: material.title }, cleanup };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;
    if (materialTransactionStarted && pendingOwnerId) {
      await releasePendingMaterialUploadsBestEffort(pendingAttachments, pendingOwnerId);
    }
    const message = error instanceof Error ? error.message : "Failed to update material";
    return { success: false, error: message };
  }
}

export async function deleteCourseMaterialAction(id: string) {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const deleted = await prisma.$transaction(async (transaction) => {
      const material = await deleteCourseMaterialForTeacher(id, session.uid, transaction);
      await writeMaterialAudit(
        {
          teacherId: session.uid,
          action: "COURSE_MATERIAL_DELETED",
          targetId: material.id,
          before: material,
          after: null,
          meta: materialMeta(session.uid, material),
        },
        transaction,
      );
      return material;
    }, MATERIAL_TRANSACTION_OPTIONS);
    const cleanupResult = await cleanupStorageKeysBestEffort(
      deleted.cleanup?.storageKeys,
      session.uid,
    );
    revalidateMaterialPathsBestEffort(deleted);

    return {
      success: true as const,
      cleanup: { ...deleted.cleanup, ...cleanupResult },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete material";
    return { success: false as const, error: message };
  }
}

type CreateClassMaterialsInput = {
  classId: string;
  materials: Array<{
    title: string;
    fileUrl: string;
    mimeType: string;
  }>;
};

export async function createClassMaterialsAction(input: CreateClassMaterialsInput) {
  await requireRole([UserRole.TEACHER]);

  return {
    success: true as const,
    data: {
      materials: input.materials.map((item, index) => ({
        id: `material-${index + 1}`,
        title: item.title,
        fileUrl: item.fileUrl,
      })),
    },
  };
}

export async function unlinkAttachmentAction(payload: {
  attachmentId: string;
  materialId: string;
}) {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    if (!payload.materialId?.trim() || !payload.attachmentId?.trim()) {
      throw new Error("Material attachment not found or not owned by teacher.");
    }
    const attachment = await prisma.$transaction(async (transaction) => {
      const unlinked = await unlinkCourseMaterialAttachmentForTeacher(
        session.uid,
        payload.materialId,
        payload.attachmentId,
        transaction,
      );
      await writeMaterialAudit(
        {
          teacherId: session.uid,
          action: "COURSE_MATERIAL_ATTACHMENT_DELETED",
          targetType: "course_material_attachment",
          targetId: unlinked.attachmentId,
          before: null,
          after: null,
          meta: {
            teacherId: session.uid,
            materialId: unlinked.materialId,
            attachmentId: unlinked.attachmentId,
            storageKey: unlinked.storageKey,
          },
        },
        transaction,
      );
      return unlinked;
    }, MATERIAL_TRANSACTION_OPTIONS);
    const cleanupResult = await cleanupStorageKeysBestEffort(
      attachment.cleanup?.storageKeys,
      session.uid,
    );
    revalidateMaterialPathsBestEffort(attachment);

    return {
      success: true as const,
      message: "Attachment deleted",
      cleanup: { ...attachment.cleanup, ...cleanupResult },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete attachment";
    return { success: false as const, error: message };
  }
}

export async function deleteCourseMaterialWithFilesAction(payload: { materialId: string }) {
  return deleteCourseMaterialAction(payload.materialId);
}
