"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  archiveManualGradeEntryForTeacher,
  createManualGradeEntryForTeacher,
  updateManualGradeEntryForTeacher,
} from "@/lib/repositories/gradebook-repository";

const manualGradeSchema = z.object({
  academicTermId: z.string().trim().min(1, "Academic term is required"),
  classGroupId: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  score: z.coerce
    .number({ invalid_type_error: "Score is required" })
    .min(0, "Score must be at least 0")
    .max(100, "Score must be at most 100"),
  studentId: z.string().trim().min(1, "Student is required"),
  subjectId: z.string().trim().min(1, "Subject is required"),
  title: z.string().trim().min(1, "Title is required"),
});

type ManualGradeActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string | Record<string, string[] | undefined> };

type ManualGradeMutationResult = {
  id: string;
  before?: unknown;
  after?: {
    academicTermId?: string;
    classGroupId?: string | null;
    studentId?: string;
    subjectId?: string;
    teacherId?: string;
  } | null;
};

function normalizeActionError(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to save manual grade.";
}

function revalidateManualGradePaths(studentId?: string) {
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/gradebook");
  if (studentId) {
    revalidatePath(`/portal/teacher/gradebook/students/${studentId}`);
  }
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
}

async function auditManualGradeMutation(input: {
  action: "MANUAL_GRADE_CREATED" | "MANUAL_GRADE_UPDATED" | "MANUAL_GRADE_ARCHIVED";
  teacherId: string;
  result: ManualGradeMutationResult;
}) {
  const after = input.result.after ?? {};
  await createAdminAuditLog(
    {
      adminUserId: input.teacherId,
      actorId: input.teacherId,
      action: input.action,
      targetType: "manualGradeEntry",
      targetId: input.result.id,
      before: input.result.before,
      after: input.result.after,
      meta: {
        teacherId: input.teacherId,
        studentId: after.studentId,
        subjectId: after.subjectId,
        academicTermId: after.academicTermId,
        manualGradeEntryId: input.result.id,
      },
    } as Parameters<typeof createAdminAuditLog>[0] & { actorId: string },
    prisma,
  );
}

export async function createManualGradeAction(payload: unknown): Promise<ManualGradeActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = manualGradeSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const created = await createManualGradeEntryForTeacher(session.uid, {
      academicTermId: parsed.data.academicTermId,
      classGroupId: parsed.data.classGroupId || null,
      description: parsed.data.description || null,
      score: parsed.data.score,
      studentId: parsed.data.studentId,
      subjectId: parsed.data.subjectId,
      title: parsed.data.title,
    });
    await auditManualGradeMutation({
      action: "MANUAL_GRADE_CREATED",
      teacherId: session.uid,
      result: created,
    });
    revalidateManualGradePaths(created.after?.studentId);

    return { success: true, data: { id: created.id } };
  } catch (error) {
    return { success: false, error: normalizeActionError(error) };
  }
}

export async function updateManualGradeAction(
  id: string,
  payload: unknown,
): Promise<ManualGradeActionResult> {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = manualGradeSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const updated = await updateManualGradeEntryForTeacher(id, session.uid, {
      academicTermId: parsed.data.academicTermId,
      classGroupId: parsed.data.classGroupId || null,
      description: parsed.data.description || null,
      score: parsed.data.score,
      studentId: parsed.data.studentId,
      subjectId: parsed.data.subjectId,
      title: parsed.data.title,
    });
    await auditManualGradeMutation({
      action: "MANUAL_GRADE_UPDATED",
      teacherId: session.uid,
      result: updated,
    });
    revalidateManualGradePaths(updated.after?.studentId);

    return { success: true, data: { id: updated.id } };
  } catch (error) {
    return { success: false, error: normalizeActionError(error) };
  }
}

export async function archiveManualGradeAction(id: string): Promise<ManualGradeActionResult> {
  const session = await requireRole([UserRole.TEACHER]);

  try {
    const archived = await archiveManualGradeEntryForTeacher(id, session.uid);
    await auditManualGradeMutation({
      action: "MANUAL_GRADE_ARCHIVED",
      teacherId: session.uid,
      result: archived,
    });
    revalidateManualGradePaths(archived.after?.studentId);

    return { success: true, data: { id: archived.id } };
  } catch (error) {
    return { success: false, error: normalizeActionError(error) };
  }
}
