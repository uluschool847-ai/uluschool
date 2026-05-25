"use server";

import { UserRole } from "@prisma/client";
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
import { createStorageService } from "@/lib/storage";

const fileUrlSchema = z
  .string()
  .trim()
  .min(1, "File URL is required")
  .superRefine((value, ctx) => {
    try {
      validateCourseMaterialFileUrl(value);
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

async function writeMaterialAudit(input: {
  teacherId: string;
  action: string;
  targetType?: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}) {
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

  await createAdminAuditLog(payload, prisma);
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

async function cleanupStorageKeys(storageKeys: unknown) {
  if (!Array.isArray(storageKeys) || storageKeys.length === 0) return;
  const storage = createStorageService({ runtimeRole: "DEVELOPER" });
  for (const storageKey of storageKeys) {
    if (typeof storageKey === "string" && storageKey.trim()) {
      await storage.delete(storageKey);
    }
  }
}

export async function submitCourseMaterialAction(
  data: unknown,
): Promise<ActionResult<{ id: string; title: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = submitCourseMaterialSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const material = await createCourseMaterialForTeacher({
      title: parsed.data.title,
      description: parsed.data.description,
      fileUrl: parsed.data.fileUrl,
      scheduledClassId: parsed.data.scheduledClassId,
      teacherId: session.uid,
      attachments: normalizeAttachments(parsed.data),
    });

    await writeMaterialAudit({
      teacherId: session.uid,
      action: "COURSE_MATERIAL_CREATED",
      targetId: material.id,
      before: null,
      after: material,
      meta: materialMeta(session.uid, material),
    });
    const attachments = normalizeAttachments(parsed.data);
    if (attachments?.length) {
      await writeMaterialAudit({
        teacherId: session.uid,
        action: "COURSE_MATERIAL_FILE_UPLOADED",
        targetType: "course_material_attachment",
        targetId: attachments[0]?.storageKey ?? null,
        before: null,
        after: attachments,
        meta: {
          ...materialMeta(session.uid, material),
          storageKey: attachments[0]?.storageKey ?? null,
          filename: attachments[0]?.filename ?? null,
          mimeType: attachments[0]?.mimeType ?? null,
          size: attachments[0]?.size ?? null,
        },
      });
    }
    revalidateMaterialPaths(material);

    if (parsed.data._redirectToList) {
      redirect("/portal/teacher/materials");
    }

    return { success: true, data: { id: material.id, title: material.title } };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;
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
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = updateCourseMaterialSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const attachments = normalizeAttachments(parsed.data);
    const material = await updateCourseMaterialForTeacher(id, session.uid, {
      ...parsed.data,
      attachments,
    });

    await writeMaterialAudit({
      teacherId: session.uid,
      action: "COURSE_MATERIAL_UPDATED",
      targetId: material.id,
      before: null,
      after: material,
      meta: materialMeta(session.uid, material),
    });
    if (attachments?.length) {
      const cleanup = (material as { cleanup?: { storageKeys?: string[] } }).cleanup;
      await cleanupStorageKeys(cleanup?.storageKeys);
      await writeMaterialAudit({
        teacherId: session.uid,
        action: "COURSE_MATERIAL_FILE_REPLACED",
        targetId: material.id,
        before: null,
        after: attachments,
        meta: {
          ...materialMeta(session.uid, material),
          oldStorageKeys: cleanup?.storageKeys ?? [],
          storageKey: attachments[0]?.storageKey ?? null,
        },
      });
    }
    revalidateMaterialPaths(material);

    if (parsed.data._redirectToList) {
      redirect("/portal/teacher/materials");
    }

    return { success: true, data: { id: material.id, title: material.title } };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Failed to update material";
    return { success: false, error: message };
  }
}

export async function deleteCourseMaterialAction(id: string) {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const deleted = await deleteCourseMaterialForTeacher(id, session.uid);
    await cleanupStorageKeys(deleted.cleanup?.storageKeys);

    await writeMaterialAudit({
      teacherId: session.uid,
      action: "COURSE_MATERIAL_DELETED",
      targetId: deleted.id,
      before: deleted,
      after: null,
      meta: materialMeta(session.uid, deleted),
    });
    revalidateMaterialPaths(deleted);

    return { success: true as const, cleanup: deleted.cleanup };
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
  materialId?: string;
  storageKey?: string;
}) {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const attachment = payload.materialId
      ? await unlinkCourseMaterialAttachmentForTeacher(
          session.uid,
          payload.materialId,
          payload.attachmentId,
        )
      : {
          attachmentId: payload.attachmentId,
          materialId: null,
          storageKey: payload.storageKey ?? "",
        };

    const storage = createStorageService({ runtimeRole: "DEVELOPER" });
    if (attachment.storageKey) {
      await storage.delete(attachment.storageKey);
    }
    await writeMaterialAudit({
      teacherId: session.uid,
      action: "COURSE_MATERIAL_ATTACHMENT_DELETED",
      targetType: "course_material_attachment",
      targetId: attachment.attachmentId,
      before: null,
      after: null,
      meta: {
        teacherId: session.uid,
        materialId: attachment.materialId,
        attachmentId: attachment.attachmentId,
        storageKey: attachment.storageKey,
      },
    });

    return { success: true as const, message: "Attachment deleted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete attachment";
    return { success: false as const, error: message };
  }
}

export async function deleteCourseMaterialWithFilesAction(payload: { materialId: string }) {
  const session = await requireRole([UserRole.TEACHER]);
  const deleted = await deleteCourseMaterialForTeacher(payload.materialId, session.uid).catch(
    () => null,
  );

  if (!deleted) {
    return {
      success: true as const,
      cleanup: {
        queued: false,
        deleted: 0,
      },
    };
  }

  await writeMaterialAudit({
    teacherId: session.uid,
    action: "COURSE_MATERIAL_DELETED",
    targetId: deleted.id,
    before: deleted,
    after: null,
    meta: materialMeta(session.uid, deleted),
  });
  revalidateMaterialPaths(deleted);

  return {
    success: true as const,
    cleanup: deleted.cleanup,
  };
}
