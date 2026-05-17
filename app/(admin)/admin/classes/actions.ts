"use server";

import { ClassGroupStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { normalizeLiveLessonUrl, validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createClassGroup,
  deleteClassGroup,
  enrollStudentToClassGroup,
  getClassGroupById,
  setClassGroupStatus,
  unenrollStudentFromClassGroup,
  updateClassGroup,
} from "@/lib/repositories/class-group-repository";
import {
  createScheduledClass,
  deleteScheduledClass,
  updateScheduledClass,
} from "@/lib/repositories/schedule-repository";

export type ClassGroupActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const CLASS_GROUP_TRANSACTION_OPTIONS = { timeout: 20_000 };

const statusSchema = z.nativeEnum(ClassGroupStatus, {
  errorMap: () => ({ message: "Status is invalid." }),
});

const optionalIdSchema = z
  .string()
  .trim()
  .transform((value) => value || null);

const optionalTextSchema = z
  .string()
  .trim()
  .transform((value) => value || null);

const dateSchema = z
  .string()
  .trim()
  .transform((value) => (value ? new Date(`${value}T00:00:00`) : null));

const dateTimeSchema = z
  .string()
  .trim()
  .min(1, "Date and time are required.")
  .transform((value) => new Date(value));

const liveLessonUrlSchema = z
  .string()
  .trim()
  .min(1, "Live lesson URL is required.")
  .superRefine((value, ctx) => {
    const validation = validateLiveLessonUrl(value, "MANUAL_URL");
    if (!validation.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: validation.reason });
    }
  })
  .transform((value) => normalizeLiveLessonUrl(value) ?? "");

const capacitySchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const capacity = Number(value);
    if (!Number.isFinite(capacity) || !Number.isInteger(capacity)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Capacity must be numeric." });
      return z.NEVER;
    }
    if (capacity < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Capacity must be non-negative." });
      return z.NEVER;
    }
    return capacity;
  });

const classGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: optionalTextSchema,
  subjectId: optionalIdSchema,
  levelId: optionalIdSchema,
  teacherId: optionalIdSchema,
  status: statusSchema,
  capacity: capacitySchema,
  startDate: dateSchema,
  endDate: dateSchema,
});

const classGroupUpdateSchema = classGroupSchema.extend({
  id: z.string().trim().min(1, "Class group id is required."),
});

const enrollmentSchema = z.object({
  classGroupId: z.string().trim().min(1, "Class group id is required."),
  studentId: z.string().trim().min(1, "Student is required."),
});

const lessonSchema = z.object({
  classGroupId: z.string().trim().min(1, "Class group id is required."),
  title: z.string().trim().min(1, "Lesson title is required."),
  description: optionalTextSchema,
  startAt: dateTimeSchema,
  endAt: dateTimeSchema,
  liveLessonUrl: liveLessonUrlSchema,
});

const lessonUpdateSchema = lessonSchema.extend({
  lessonId: z.string().trim().min(1, "Lesson id is required."),
});

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.includes("NEXT_REDIRECT")
  );
}

function isFlashMode(formData: FormData) {
  return formData.get("flash")?.toString() === "true";
}

function getRedirectTarget(formData: FormData, key: "successRedirect" | "errorRedirect") {
  const value = formData.get(key)?.toString().trim();
  return value || null;
}

function buildRedirectUrl(pathname: string, key: "classMessage" | "classError", message: string) {
  return `${pathname}${pathname.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
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

function revalidateClassGroupPaths(groupId?: string | null) {
  safeRevalidatePath("/admin/classes");
  if (groupId) {
    safeRevalidatePath(`/admin/classes/${groupId}`);
    safeRevalidatePath(`/admin/classes/${groupId}/edit`);
  }
  safeRevalidatePath("/admin/students");
  safeRevalidatePath("/portal/schedule");
  safeRevalidatePath("/portal/teacher");
  safeRevalidatePath("/portal/student");
  safeRevalidatePath("/portal/parent");
}

function maybeRedirectSuccess(
  formData: FormData,
  message: string,
  defaultTarget = "/admin/classes",
) {
  if (!isFlashMode(formData)) return;
  const target = getRedirectTarget(formData, "successRedirect") ?? defaultTarget;
  redirect(buildRedirectUrl(target, "classMessage", message));
}

function maybeRedirectError(formData: FormData, message: string, defaultTarget = "/admin/classes") {
  if (!isFlashMode(formData)) return;
  const target = getRedirectTarget(formData, "errorRedirect") ?? defaultTarget;
  redirect(buildRedirectUrl(target, "classError", message));
}

function failureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeClassGroupInput(formData: FormData) {
  return {
    name: formData.get("name")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    subjectId: formData.get("subjectId")?.toString() ?? "",
    levelId: formData.get("levelId")?.toString() ?? "",
    teacherId: formData.get("teacherId")?.toString() ?? "",
    status: formData.get("status")?.toString() ?? "",
    capacity: formData.get("capacity")?.toString() ?? "",
    startDate: formData.get("startDate")?.toString() ?? "",
    endDate: formData.get("endDate")?.toString() ?? "",
  };
}

function normalizeEnrollmentInput(formData: FormData) {
  return {
    classGroupId: formData.get("classGroupId")?.toString() ?? formData.get("id")?.toString() ?? "",
    studentId: formData.get("studentId")?.toString() ?? "",
  };
}

function normalizeLessonInput(formData: FormData) {
  return {
    classGroupId: formData.get("classGroupId")?.toString() ?? formData.get("id")?.toString() ?? "",
    lessonId: formData.get("lessonId")?.toString() ?? "",
    title: formData.get("title")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    startAt: formData.get("startAt")?.toString() ?? "",
    endAt: formData.get("endAt")?.toString() ?? "",
    liveLessonUrl: formData.get("liveLessonUrl")?.toString() ?? "",
  };
}

function flattenFieldErrors(errors: Record<string, string[] | undefined>) {
  return Object.values(errors)
    .flat()
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

async function requireAdmin(fallback: string): Promise<
  | { success: true; uid: string }
  | {
      success: false;
      result: ClassGroupActionResult;
    }
> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    return { success: true, uid: session.uid };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return {
      success: false,
      result: {
        success: false,
        message: failureMessage(error, fallback),
      },
    };
  }
}

async function writeClassGroupAudit(
  input: {
    adminUserId: string;
    action: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    meta?: Record<string, unknown>;
  },
  tx: Parameters<typeof createAdminAuditLog>[1],
) {
  await createAdminAuditLog(
    {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: "class_group",
      targetId: input.targetId,
      before: input.before,
      after: input.after,
      meta: {
        actorRole: UserRole.ADMIN,
        classGroupId: input.targetId,
        ...input.meta,
      },
    },
    tx,
  );
}

export async function createClassGroupAction(formData: FormData): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to create class group.");
  if (!session.success) return session.result;

  const parsed = classGroupSchema.safeParse(normalizeClassGroupInput(formData));
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    maybeRedirectError(
      formData,
      flattenFieldErrors(errors) || "Please review the class group form and try again.",
    );
    return { success: false, errors };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const classGroup = await createClassGroup(parsed.data, tx);
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_CREATED",
          targetId: classGroup.id,
          before: null,
          after: classGroup,
          meta: { teacherId: classGroup.teacherId ?? parsed.data.teacherId },
        },
        tx,
      );
      return classGroup;
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(created.id);
    maybeRedirectSuccess(formData, "Class group created.", `/admin/classes/${created.id}`);
    return { success: true, message: "Class group created." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to create class group.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function updateClassGroupAction(formData: FormData): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to update class group.");
  if (!session.success) return session.result;

  const parsed = classGroupUpdateSchema.safeParse({
    id: formData.get("id")?.toString() ?? "",
    ...normalizeClassGroupInput(formData),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    maybeRedirectError(
      formData,
      flattenFieldErrors(errors) || "Please review the class group form and try again.",
    );
    return { success: false, errors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await updateClassGroup(parsed.data.id, parsed.data, tx);
      const auditSource = updated as typeof updated & { before?: unknown; after?: unknown };
      const before = auditSource.before ?? { id: parsed.data.id };
      const after = auditSource.after ?? updated;
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_UPDATED",
          targetId: parsed.data.id,
          before,
          after,
          meta: { teacherId: parsed.data.teacherId },
        },
        tx,
      );

      const beforeTeacherId =
        typeof before === "object" && before !== null && "teacherId" in before
          ? (before as { teacherId?: unknown }).teacherId
          : undefined;
      const afterTeacherId =
        typeof after === "object" && after !== null && "teacherId" in after
          ? (after as { teacherId?: unknown }).teacherId
          : parsed.data.teacherId;
      if (beforeTeacherId !== afterTeacherId) {
        await tx.scheduledClass.updateMany({
          where: {
            classGroupId: parsed.data.id,
            teacherId: typeof beforeTeacherId === "string" ? beforeTeacherId : null,
          },
          data: {
            teacherId: typeof afterTeacherId === "string" ? afterTeacherId : null,
          },
        });
        await writeClassGroupAudit(
          {
            adminUserId: session.uid,
            action: "CLASS_GROUP_TEACHER_UPDATED",
            targetId: parsed.data.id,
            before,
            after,
            meta: { teacherId: afterTeacherId ?? null },
          },
          tx,
        );
      }
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(parsed.data.id);
    maybeRedirectSuccess(formData, "Class group updated.", `/admin/classes/${parsed.data.id}`);
    return { success: true, message: "Class group updated." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to update class group.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function updateClassGroupStatusAction(
  formData: FormData,
): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to update class group status.");
  if (!session.success) return session.result;

  const id = formData.get("id")?.toString().trim() ?? "";
  const parsedStatus = statusSchema.safeParse(formData.get("status")?.toString() ?? "");
  if (!id || !parsedStatus.success) {
    return {
      success: false,
      errors: {
        ...(id ? {} : { id: ["Class group id is required."] }),
        ...(parsedStatus.success ? {} : { status: ["Status is invalid."] }),
      },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await setClassGroupStatus(id, parsedStatus.data, tx);
      const auditSource = updated as typeof updated & { before?: unknown; after?: unknown };
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_STATUS_UPDATED",
          targetId: id,
          before: auditSource.before ?? { id },
          after: auditSource.after ?? updated,
        },
        tx,
      );
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(id);
    maybeRedirectSuccess(formData, "Class group status updated.", `/admin/classes/${id}`);
    return { success: true, message: "Class group status updated." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to update class group status.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function deleteClassGroupAction(formData: FormData): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to delete class group.");
  if (!session.success) return session.result;

  const id = formData.get("id")?.toString().trim() ?? "";
  if (!id) {
    return { success: false, message: "Class group id is required." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const removed = await deleteClassGroup(id, tx);
      const auditSource = removed as typeof removed & { before?: unknown };
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_DELETED",
          targetId: id,
          before: auditSource.before ?? removed,
          after: { deleted: true },
        },
        tx,
      );
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(id);
    maybeRedirectSuccess(formData, "Class group deleted.");
    return { success: true, message: "Class group deleted." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to delete class group.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function enrollStudentToClassGroupAction(
  formData: FormData,
): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to enroll student.");
  if (!session.success) return session.result;

  const parsed = enrollmentSchema.safeParse(normalizeEnrollmentInput(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  try {
    const enrolledStudentName = await prisma.$transaction(async (tx) => {
      const updated = await enrollStudentToClassGroup(
        parsed.data.classGroupId,
        parsed.data.studentId,
        tx,
      );
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_STUDENT_ENROLLED",
          targetId: parsed.data.classGroupId,
          before: { studentId: parsed.data.studentId, enrolled: false },
          after: { studentId: parsed.data.studentId, enrolled: true },
          meta: { studentId: parsed.data.studentId },
        },
        tx,
      );
      return updated.students?.find((student) => student.id === parsed.data.studentId)?.fullName;
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(parsed.data.classGroupId);
    const message = enrolledStudentName
      ? `Student enrolled: ${enrolledStudentName}.`
      : "Student enrolled.";
    maybeRedirectSuccess(formData, message, `/admin/classes/${parsed.data.classGroupId}`);
    return { success: true, message };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to enroll student.");
    maybeRedirectError(formData, message, `/admin/classes/${parsed.data.classGroupId}`);
    return { success: false, message };
  }
}

export async function unenrollStudentFromClassGroupAction(
  formData: FormData,
): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to remove student.");
  if (!session.success) return session.result;

  const parsed = enrollmentSchema.safeParse(normalizeEnrollmentInput(formData));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await unenrollStudentFromClassGroup(parsed.data.classGroupId, parsed.data.studentId, tx);
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_STUDENT_UNENROLLED",
          targetId: parsed.data.classGroupId,
          before: { studentId: parsed.data.studentId, enrolled: true },
          after: { studentId: parsed.data.studentId, enrolled: false },
          meta: { studentId: parsed.data.studentId },
        },
        tx,
      );
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(parsed.data.classGroupId);
    maybeRedirectSuccess(
      formData,
      "Student removed.",
      `/admin/classes/${parsed.data.classGroupId}`,
    );
    return { success: true, message: "Student removed." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to remove student.");
    maybeRedirectError(formData, message, `/admin/classes/${parsed.data.classGroupId}`);
    return { success: false, message };
  }
}

export async function createClassGroupLessonAction(
  formData: FormData,
): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to create lesson.");
  if (!session.success) return session.result;

  const parsed = lessonSchema.safeParse(normalizeLessonInput(formData));
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    maybeRedirectError(
      formData,
      flattenFieldErrors(errors) || "Please review the lesson form and try again.",
      `/admin/classes/${formData.get("classGroupId")?.toString() ?? ""}/lessons/new`,
    );
    return { success: false, errors };
  }

  try {
    const lesson = await prisma.$transaction(async (tx) => {
      const group = await getClassGroupById(parsed.data.classGroupId, tx);
      if (!group) throw new Error("Class group not found.");
      if (!group.teacherId)
        throw new Error("Class group must have a teacher before lessons can be created.");

      const created = await createScheduledClass(
        {
          classGroupId: parsed.data.classGroupId,
          title: parsed.data.title,
          description: parsed.data.description,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          liveLessonUrl: parsed.data.liveLessonUrl,
          teacherId: group.teacherId,
          subjectId: group.subjectId,
        },
        tx,
      );
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_CREATED",
          targetId: parsed.data.classGroupId,
          before: null,
          after: created,
          meta: { lessonId: created.id, teacherId: group.teacherId },
        },
        tx,
      );
      return created;
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(parsed.data.classGroupId);
    maybeRedirectSuccess(formData, "Lesson created.", `/admin/classes/${parsed.data.classGroupId}`);
    return { success: true, message: "Lesson created.", ...(lesson ? {} : {}) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to create lesson.");
    maybeRedirectError(formData, message, `/admin/classes/${parsed.data.classGroupId}/lessons/new`);
    return { success: false, message };
  }
}

export async function updateClassGroupLessonAction(
  formData: FormData,
): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to update lesson.");
  if (!session.success) return session.result;

  const parsed = lessonUpdateSchema.safeParse(normalizeLessonInput(formData));
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return { success: false, errors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await updateScheduledClass(
        parsed.data.lessonId,
        {
          classGroupId: parsed.data.classGroupId,
          title: parsed.data.title,
          description: parsed.data.description,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          liveLessonUrl: parsed.data.liveLessonUrl,
        },
        tx,
      );
      const auditSource = updated as typeof updated & { before?: unknown; after?: unknown };
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_UPDATED",
          targetId: parsed.data.classGroupId,
          before: auditSource.before ?? { id: parsed.data.lessonId },
          after: auditSource.after ?? updated,
          meta: { lessonId: parsed.data.lessonId },
        },
        tx,
      );
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(parsed.data.classGroupId);
    maybeRedirectSuccess(formData, "Lesson updated.", `/admin/classes/${parsed.data.classGroupId}`);
    return { success: true, message: "Lesson updated." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to update lesson.");
    maybeRedirectError(formData, message, `/admin/classes/${parsed.data.classGroupId}`);
    return { success: false, message };
  }
}

export async function deleteClassGroupLessonAction(
  formData: FormData,
): Promise<ClassGroupActionResult> {
  const session = await requireAdmin("Failed to delete lesson.");
  if (!session.success) return session.result;

  const classGroupId = formData.get("classGroupId")?.toString().trim() ?? "";
  const lessonId = formData.get("lessonId")?.toString().trim() ?? "";
  if (!classGroupId || !lessonId) {
    return { success: false, message: "Class group and lesson id are required." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const removed = await deleteScheduledClass(lessonId, tx);
      await writeClassGroupAudit(
        {
          adminUserId: session.uid,
          action: "CLASS_GROUP_LESSON_DELETED",
          targetId: classGroupId,
          before: removed,
          after: { deleted: true },
          meta: { lessonId },
        },
        tx,
      );
    }, CLASS_GROUP_TRANSACTION_OPTIONS);

    revalidateClassGroupPaths(classGroupId);
    maybeRedirectSuccess(formData, "Lesson deleted.", `/admin/classes/${classGroupId}`);
    return { success: true, message: "Lesson deleted." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = failureMessage(error, "Failed to delete lesson.");
    maybeRedirectError(formData, message, `/admin/classes/${classGroupId}`);
    return { success: false, message };
  }
}
