"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  archiveHomeworkAssignment,
  createHomeworkAssignment,
  updateHomeworkAssignment,
} from "@/lib/repositories/homework-repository";

const dueDateRequiredMessage = "Due date is required";

const createHomeworkSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().trim().optional().default(""),
    classId: z.string().trim().optional(),
    scheduledClassId: z.string().trim().optional(),
    subjectId: z.string().trim().optional(),
    dueDate: z
      .string()
      .trim()
      .min(1, dueDateRequiredMessage)
      .refine((value) => !Number.isNaN(new Date(value).getTime()), "Due date is invalid"),
  })
  .superRefine((value, ctx) => {
    if (!value.classId && !value.scheduledClassId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["classId"],
        message: "Class is required",
      });
    }
  });

const editHomeworkSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").optional(),
    description: z.string().trim().optional(),
    classId: z.string().trim().optional(),
    scheduledClassId: z.string().trim().optional(),
    subjectId: z.string().trim().optional().nullable(),
    dueDate: z
      .string()
      .trim()
      .min(1, dueDateRequiredMessage)
      .refine((value) => !Number.isNaN(new Date(value).getTime()), "Due date is invalid")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.classId !== undefined && !value.classId && !value.scheduledClassId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["classId"],
        message: "Class is required",
      });
    }
  });

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string | Record<string, string[] | undefined> };

type HomeworkAuditSource = {
  id?: string | null;
  scheduledClassId?: string | null;
  classId?: string | null;
  scheduledClass?: { classGroupId?: string | null; classGroup?: { id?: string | null } | null };
  classGroupId?: string | null;
};

function affectedClassGroupId(source: HomeworkAuditSource | null | undefined, fallback?: string) {
  return (
    source?.scheduledClass?.classGroup?.id ??
    source?.scheduledClass?.classGroupId ??
    source?.classGroupId ??
    fallback ??
    source?.scheduledClassId ??
    source?.classId ??
    null
  );
}

function revalidateHomeworkPaths(classGroupId?: string | null) {
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/classes");
  if (classGroupId) revalidatePath(`/portal/teacher/classes/${classGroupId}`);
  revalidatePath("/portal/teacher/assignments");
  revalidatePath("/portal/student");
  revalidatePath("/portal/student/assignments");
  revalidatePath("/portal/parent");
}

async function writeHomeworkAudit(input: {
  teacherId: string;
  action: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  meta?: Record<string, unknown>;
}) {
  const payload = {
    adminUserId: input.teacherId,
    actorId: input.teacherId,
    action: input.action,
    targetType: "homework",
    targetId: input.targetId,
    before: input.before,
    after: input.after,
    meta: { teacherId: input.teacherId, ...input.meta },
  };
  await createAdminAuditLog(payload, prisma);
}

export async function createHomeworkAction(data: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = createHomeworkSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const created = await createHomeworkAssignment({
      title: parsed.data.title,
      description: parsed.data.description,
      scheduledClassId: parsed.data.scheduledClassId ?? parsed.data.classId,
      classId: parsed.data.classId ?? parsed.data.scheduledClassId,
      dueDate: new Date(parsed.data.dueDate),
      teacherId: session.uid,
      subjectId: parsed.data.subjectId ?? null,
    });

    const classGroupId = affectedClassGroupId(
      created,
      parsed.data.classId ?? parsed.data.scheduledClassId,
    );
    await writeHomeworkAudit({
      teacherId: session.uid,
      action: "HOMEWORK_CREATED",
      targetId: created.id,
      before: null,
      after: created,
      meta: {
        assignmentId: created.id,
        scheduledClassId: created.scheduledClassId ?? parsed.data.classId ?? null,
        classGroupId,
      },
    });
    revalidateHomeworkPaths(classGroupId);
    return { success: true, data: { id: created.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create homework assignment",
    };
  }
}

export async function editHomeworkAction(
  id: string,
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = editHomeworkSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const updated = await updateHomeworkAssignment(id, session.uid, {
      title: parsed.data.title,
      description: parsed.data.description,
      scheduledClassId: parsed.data.scheduledClassId ?? parsed.data.classId,
      classId: parsed.data.classId ?? parsed.data.scheduledClassId,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      subjectId: parsed.data.subjectId ?? undefined,
    });

    const classGroupId = affectedClassGroupId(
      updated,
      parsed.data.classId ?? parsed.data.scheduledClassId,
    );
    await writeHomeworkAudit({
      teacherId: session.uid,
      action: "HOMEWORK_UPDATED",
      targetId: updated.id,
      before: "before" in updated ? updated.before : null,
      after: "after" in updated ? updated.after : updated,
      meta: {
        assignmentId: updated.id,
        scheduledClassId: updated.scheduledClassId ?? parsed.data.classId ?? null,
        classGroupId,
      },
    });
    revalidateHomeworkPaths(classGroupId);
    return { success: true, data: { id: updated.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update homework assignment",
    };
  }
}

export async function archiveHomeworkAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const archived = await archiveHomeworkAssignment(id, session.uid);
    const classGroupId = affectedClassGroupId(archived);
    await writeHomeworkAudit({
      teacherId: session.uid,
      action: "HOMEWORK_ARCHIVED",
      targetId: archived.id,
      before: "before" in archived ? archived.before : null,
      after: "after" in archived ? archived.after : archived,
      meta: {
        assignmentId: archived.id,
        scheduledClassId: archived.scheduledClassId ?? null,
        classGroupId,
      },
    });
    revalidateHomeworkPaths(classGroupId);
    return { success: true, data: { id: archived.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive homework assignment",
    };
  }
}

export async function submitHomeworkAction(data: unknown): Promise<ActionResult<{ id: string }>> {
  return createHomeworkAction(data);
}

export const updateHomeworkAction = editHomeworkAction;
