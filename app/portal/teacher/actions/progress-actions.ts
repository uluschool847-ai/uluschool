"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  archiveProgressNoteForTeacher,
  createProgressNoteForTeacher,
  updateProgressNoteForTeacher,
} from "@/lib/repositories/student-progress-repository";

const performanceLevels = ["EXCELLENT", "GOOD", "STRUGGLING"] as const;

const submitProgressSchema = z.object({
  studentId: z.string().trim().min(1, "Student is required"),
  subjectId: z.string().trim().min(1, "Subject is required"),
  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(2000, "Content must be 2000 characters or less"),
  performanceLevel: z.enum(performanceLevels, {
    errorMap: () => ({ message: "Performance level is invalid" }),
  }),
});

const editProgressSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(2000, "Content must be 2000 characters or less"),
  performanceLevel: z.enum(performanceLevels, {
    errorMap: () => ({ message: "Performance level is invalid" }),
  }),
});

type ProgressActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string | Record<string, string[] | undefined> };

function normalizeActionError(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

function revalidateProgressPaths(studentId: string) {
  revalidatePath("/portal/teacher");
  revalidatePath(`/portal/teacher/students/${studentId}`);
  revalidatePath(`/portal/teacher/students/${studentId}/progress`);
  revalidatePath("/portal/teacher/classes");
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
  revalidatePath(`/admin/students/${studentId}`);
}

async function auditProgressMutation(input: {
  action: "STUDENT_PROGRESS_CREATED" | "STUDENT_PROGRESS_UPDATED" | "STUDENT_PROGRESS_ARCHIVED";
  teacherId: string;
  note: {
    id: string;
    studentId: string;
    subjectId: string;
    performanceLevel?: string;
    gradeLevel?: string;
    before?: unknown;
    after?: unknown;
  };
}) {
  const performanceLevel = input.note.performanceLevel ?? input.note.gradeLevel;
  await createAdminAuditLog(
    {
      adminUserId: input.teacherId,
      actorId: input.teacherId,
      action: input.action,
      targetType: "studentProgress",
      targetId: input.note.id,
      before: input.note.before,
      after: input.note.after,
      meta: {
        teacherId: input.teacherId,
        studentId: input.note.studentId,
        subjectId: input.note.subjectId,
        progressNoteId: input.note.id,
        performanceLevel,
      },
    } as Parameters<typeof createAdminAuditLog>[0] & { actorId: string },
    prisma,
  );
}

export async function submitProgressNoteAction(payload: unknown): Promise<ProgressActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = submitProgressSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.flatten().fieldErrors,
      };
    }

    const created = await createProgressNoteForTeacher({
      teacherId: session.uid,
      studentId: parsed.data.studentId,
      subjectId: parsed.data.subjectId,
      content: parsed.data.content,
      performanceLevel: parsed.data.performanceLevel,
    });

    await auditProgressMutation({
      action: "STUDENT_PROGRESS_CREATED",
      teacherId: session.uid,
      note: created,
    });
    revalidateProgressPaths(created.studentId);

    return {
      success: true,
      data: { id: created.id },
    };
  } catch (error) {
    return {
      success: false,
      error: normalizeActionError(error),
    };
  }
}

export async function editProgressNoteAction(
  noteId: string,
  payload: unknown,
): Promise<ProgressActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = editProgressSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.flatten().fieldErrors,
      };
    }

    const updated = await updateProgressNoteForTeacher(noteId, session.uid, {
      content: parsed.data.content,
      performanceLevel: parsed.data.performanceLevel,
    });

    await auditProgressMutation({
      action: "STUDENT_PROGRESS_UPDATED",
      teacherId: session.uid,
      note: updated,
    });
    revalidateProgressPaths(updated.studentId);

    return {
      success: true,
      data: { id: updated.id },
    };
  } catch (error) {
    return {
      success: false,
      error: normalizeActionError(error),
    };
  }
}

export async function archiveProgressNoteAction(noteId: string): Promise<ProgressActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const archived = await archiveProgressNoteForTeacher(noteId, session.uid);

    await auditProgressMutation({
      action: "STUDENT_PROGRESS_ARCHIVED",
      teacherId: session.uid,
      note: archived,
    });
    revalidateProgressPaths(archived.studentId);

    return {
      success: true,
      data: { id: archived.id },
    };
  } catch (error) {
    return {
      success: false,
      error: normalizeActionError(error),
    };
  }
}
