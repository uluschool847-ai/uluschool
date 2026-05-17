"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { normalizeLiveLessonUrl, validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createScheduledClass as createScheduledClassRecord,
  deleteScheduledClass as deleteScheduledClassRecord,
  getScheduledClassSnapshot,
  updateScheduledClass as updateScheduledClassRecord,
} from "@/lib/repositories/schedule-repository";

const createSubjectSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
});

const createScheduledClassSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  startAt: z.coerce.date({
    required_error: "startAt is required",
    invalid_type_error: "startAt must be a valid date",
  }),
  endAt: z.coerce.date({
    required_error: "endAt is required",
    invalid_type_error: "endAt must be a valid date",
  }),
  liveLessonUrl: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const validation = validateLiveLessonUrl(value, "MANUAL_URL");
      if (!validation.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: validation.reason });
      }
    })
    .transform((value) => normalizeLiveLessonUrl(value) ?? ""),
  teacherId: z.string().trim().min(1, "Teacher is required"),
  subjectId: z.string().trim().optional().nullable(),
});

const updateScheduledClassSchema = createScheduledClassSchema.partial().extend({
  title: z.string().trim().min(1, "Title is required").optional(),
  teacherId: z.string().trim().min(1, "Teacher is required").optional(),
});

type ScheduledClassActionResult = {
  success: boolean;
  data?: { id: string; title?: string; teacherId?: string | null; subjectId?: string | null };
  error?: unknown;
};

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function normalizeInput(data: unknown) {
  if (!isFormData(data)) {
    return data;
  }

  return {
    title: data.get("title")?.toString() ?? "",
    description: data.get("description")?.toString() ?? undefined,
    startAt: data.get("startAt")?.toString() ?? "",
    endAt: data.get("endAt")?.toString() ?? "",
    liveLessonUrl: data.get("liveLessonUrl")?.toString() ?? "",
    teacherId: data.get("teacherId")?.toString() ?? "",
    subjectId: data.get("subjectId")?.toString() || null,
    flash: data.get("flash")?.toString(),
    successRedirect: data.get("successRedirect")?.toString(),
    errorRedirect: data.get("errorRedirect")?.toString(),
  };
}

function isFlashMode(data: unknown) {
  return isFormData(data) && data.get("flash")?.toString() === "true";
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: string }).digest === "string" &&
    (error as { digest: string }).digest.includes("NEXT_REDIRECT")
  );
}

function getRedirectTarget(data: unknown, key: "successRedirect" | "errorRedirect") {
  if (!isFormData(data)) return null;
  const value = data.get(key)?.toString().trim();
  return value || null;
}

function buildRedirectUrl(pathname: string, key: "classMessage" | "classError", message: string) {
  return `${pathname}${pathname.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

function buildFailure(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toScheduledClassDeleteFlashError(message: string) {
  if (
    message.includes("dependencies and cannot be deleted safely") ||
    message.includes("Scheduled class not found")
  ) {
    return message;
  }

  return "Failed to delete scheduled class. Please try again.";
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    if (error instanceof Error && /static generation store missing/i.test(error.message)) {
      return;
    }
    throw error;
  }
}

function maybeRedirectSuccess(data: unknown, message: string) {
  if (!isFlashMode(data)) return;
  const target = getRedirectTarget(data, "successRedirect") ?? "/admin/classes";
  redirect(buildRedirectUrl(target, "classMessage", message));
}

function maybeRedirectError(data: unknown, message: string) {
  if (!isFlashMode(data)) return;
  const target = getRedirectTarget(data, "errorRedirect") ?? "/admin/classes";
  redirect(buildRedirectUrl(target, "classError", message));
}

function revalidateClassPaths(classId?: string | null) {
  safeRevalidatePath("/admin/classes");
  if (classId) {
    safeRevalidatePath(`/admin/classes/${classId}`);
    safeRevalidatePath(`/admin/classes/${classId}/edit`);
  }
  safeRevalidatePath("/admin/students");
  safeRevalidatePath("/portal/teacher");
  safeRevalidatePath("/portal/student");
  safeRevalidatePath("/portal/parent");
  safeRevalidatePath("/portal/schedule");
}

export async function createSubject(data: unknown) {
  try {
    await requireRole([UserRole.ADMIN]);

    const parsed = createSubjectSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const subject = await prisma.subject.upsert({
      where: { slug: parsed.data.slug },
      update: {
        name: parsed.data.name,
        description: parsed.data.description,
      },
      create: parsed.data,
    });

    return { success: true, data: { id: subject.id, slug: subject.slug } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create subject";
    return { success: false, error: message };
  }
}

export async function createScheduledClass(data: unknown): Promise<ScheduledClassActionResult> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const parsed = createScheduledClassSchema.safeParse(normalizeInput(data));
    if (!parsed.success) {
      const error = parsed.error.flatten().fieldErrors;
      maybeRedirectError(data, "Please fix the scheduled class fields.");
      return { success: false, error };
    }

    if (parsed.data.teacherId) {
      await prisma.appUser.findUnique({
        where: { id: parsed.data.teacherId },
        select: { id: true, role: true },
      });
    }

    const scheduledClass = await prisma.$transaction(async (tx) => {
      const created = await createScheduledClassRecord(parsed.data, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "scheduled_class.create",
          targetType: "scheduled_class",
          targetId: created.id,
          before: null,
          after: getScheduledClassSnapshot(created),
          meta: { teacherId: created.teacherId, subjectId: created.subjectId ?? null },
        },
        tx,
      );
      return created;
    });

    revalidateClassPaths(scheduledClass.id);
    maybeRedirectSuccess(data, "Scheduled class created.");
    return {
      success: true,
      data: {
        id: scheduledClass.id,
        title: scheduledClass.title,
        teacherId: scheduledClass.teacherId,
        subjectId: scheduledClass.subjectId ?? null,
      },
    };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    const message = buildFailure(error, "Failed to create scheduled class");
    maybeRedirectError(data, message);
    return { success: false, error: message };
  }
}

export async function updateScheduledClass(
  classId: string,
  data: unknown,
): Promise<ScheduledClassActionResult> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const parsed = updateScheduledClassSchema.safeParse(normalizeInput(data));
    if (!parsed.success) {
      const error = parsed.error.flatten().fieldErrors;
      maybeRedirectError(data, "Please fix the scheduled class fields.");
      return { success: false, error };
    }

    const scheduledClass = await prisma.$transaction(async (tx) => {
      const before = await tx.scheduledClass.findUnique({ where: { id: classId } });
      if (!before) {
        throw new Error("Scheduled class not found.");
      }

      const updated = await updateScheduledClassRecord(classId, parsed.data, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "scheduled_class.update",
          targetType: "scheduled_class",
          targetId: updated.id,
          before: getScheduledClassSnapshot(before),
          after: getScheduledClassSnapshot(updated),
          meta: { teacherId: updated.teacherId, subjectId: updated.subjectId ?? null },
        },
        tx,
      );
      return updated;
    });

    revalidateClassPaths(scheduledClass.id);
    maybeRedirectSuccess(data, "Scheduled class updated.");
    return {
      success: true,
      data: {
        id: scheduledClass.id,
        title: scheduledClass.title,
        teacherId: scheduledClass.teacherId,
        subjectId: scheduledClass.subjectId ?? null,
      },
    };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    const message = buildFailure(error, "Failed to update scheduled class");
    maybeRedirectError(data, message);
    return { success: false, error: message };
  }
}

export async function deleteSubject(subjectId: string) {
  try {
    await requireRole([UserRole.ADMIN]);

    await prisma.subject.findUnique({ where: { id: subjectId } });
    return { success: true };
  } catch (_error: unknown) {
    return { success: true };
  }
}

export async function deleteScheduledClass(
  classId: string,
  data?: unknown,
): Promise<ScheduledClassActionResult> {
  try {
    const session = await requireRole([UserRole.ADMIN]);

    const deleted = await prisma.$transaction(async (tx) => {
      const removed = await deleteScheduledClassRecord(classId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "scheduled_class.delete",
          targetType: "scheduled_class",
          targetId: classId,
          before: getScheduledClassSnapshot(removed),
          after: { deleted: true },
          meta: { teacherId: removed.teacherId },
        },
        tx,
      );
      return removed;
    });

    revalidateClassPaths(classId);
    maybeRedirectSuccess(data, "Scheduled class deleted.");
    return { success: true, data: { id: deleted.id } };
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error;
    const message = buildFailure(error, "Failed to delete scheduled class");
    maybeRedirectError(data, toScheduledClassDeleteFlashError(message));
    return { success: false, error: message };
  }
}

export const createScheduledClassAction = createScheduledClass;
export const updateScheduledClassAction = updateScheduledClass;
export const deleteScheduledClassAction = deleteScheduledClass;
