"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { gradeSubmissionForTeacher } from "@/lib/repositories/submission-repository";

const MAX_SUBMISSION_FEEDBACK_LENGTH = 2000;

const feedbackSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  })
  .refine(
    (value) => value === null || value.length <= MAX_SUBMISSION_FEEDBACK_LENGTH,
    "Feedback must be 2000 characters or fewer",
  );

const gradeSubmissionSchema = z.object({
  submissionId: z.string().trim().min(1, "Submission ID is required"),
  grade: z.coerce
    .number()
    .min(0, "Grade must be greater than or equal to 0")
    .max(100, "Grade must be less than or equal to 100"),
  feedback: feedbackSchema,
});

type GradeSubmissionActionInput = {
  submissionId: string;
  grade: number;
  feedback?: string | null;
};

type GradeSubmissionActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string | Record<string, string[] | undefined> };

function revalidateGradingPaths(submissionId: string) {
  revalidatePath("/portal/teacher");
  revalidatePath("/portal/teacher/submissions");
  revalidatePath(`/portal/teacher/submissions/${submissionId}`);
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent");
}

async function writeSubmissionAudit(input: {
  teacherId: string;
  action: string;
  targetId: string;
  before: unknown;
  after: unknown;
  meta?: Record<string, unknown>;
}) {
  const payload = {
    adminUserId: input.teacherId,
    actorId: input.teacherId,
    action: input.action,
    targetType: "submission",
    targetId: input.targetId,
    before: input.before,
    after: input.after,
    meta: { teacherId: input.teacherId, submissionId: input.targetId, ...input.meta },
  };
  await createAdminAuditLog(payload, prisma);
}

function feedbackFrom(value: unknown) {
  if (!value || typeof value !== "object" || !("feedback" in value)) {
    return null;
  }
  return (value as { feedback?: string | null }).feedback ?? null;
}

export async function gradeSubmissionAction(
  payload: GradeSubmissionActionInput,
): Promise<GradeSubmissionActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = gradeSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const graded = await gradeSubmissionForTeacher(session.uid, parsed.data.submissionId, {
      grade: parsed.data.grade,
      feedback: parsed.data.feedback,
    });

    const before = "before" in graded ? graded.before : null;
    const after = "after" in graded ? graded.after : graded;

    await writeSubmissionAudit({
      teacherId: session.uid,
      action: graded.previousGrade === null ? "SUBMISSION_GRADED" : "SUBMISSION_GRADE_UPDATED",
      targetId: graded.id,
      before,
      after,
      meta: {
        assignmentId: graded.assignmentId ?? null,
        feedbackChanged: feedbackFrom(before) !== feedbackFrom(after),
        previousGrade: graded.previousGrade ?? null,
        grade: graded.grade,
      },
    });
    revalidateGradingPaths(graded.id);

    return { success: true, data: { id: graded.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    if (/not owned|not found|forbidden|unauthorized/i.test(message)) {
      return { success: false, error: "Forbidden/Unauthorized" };
    }

    return { success: false, error: message };
  }
}
