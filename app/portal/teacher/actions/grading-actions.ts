"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { gradeSubmissionForTeacher } from "@/lib/repositories/portal-repository";

const gradeSubmissionSchema = z.object({
  submissionId: z.string().trim().min(1, "Submission ID is required"),
  grade: z.coerce.number().min(0, "Grade must be greater than or equal to 0"),
  feedback: z.string().optional().nullable(),
});

type GradeSubmissionActionInput = {
  submissionId: string;
  grade: number;
  feedback?: string | null;
};

type GradeSubmissionActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string | Record<string, string[] | undefined> };

export async function gradeSubmissionAction(
  payload: GradeSubmissionActionInput,
): Promise<GradeSubmissionActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = gradeSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const graded = await gradeSubmissionForTeacher({
      teacherId: session.uid,
      submissionId: parsed.data.submissionId,
      grade: parsed.data.grade,
      feedback: parsed.data.feedback ?? null,
    });

    return { success: true, data: { id: graded.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    if (/not owned|not found|forbidden|unauthorized/i.test(message)) {
      return { success: false, error: "Forbidden/Unauthorized" };
    }

    return { success: false, error: message };
  }
}
