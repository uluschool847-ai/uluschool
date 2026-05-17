"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { gradeHomework, submitOrResubmitStudentWork } from "@/lib/repositories/portal-repository";
import * as portalRepository from "@/lib/repositories/portal-repository";

import { z } from "zod";

const submitHomeworkSchema = z.object({
  homeworkId: z.string().min(1, "Homework ID is required"),
  contentUrl: z.string().url("Valid Content URL is required").min(1, "Content URL is required"),
  studentId: z.string().min(1).optional(),
});

const gradeHomeworkSchema = z.object({
  submissionId: z.string().min(1, "Submission ID is required"),
  grade: z.coerce.number({ invalid_type_error: "Grade must be a number" }).min(0).max(100),
  feedback: z.string().optional(),
});

export async function submitHomeworkAction(formData: FormData) {
  const session = await requireRole([UserRole.STUDENT]);

  const rawInput = {
    homeworkId: formData.get("homeworkId")?.toString() || "",
    contentUrl: formData.get("contentUrl")?.toString() || "",
    studentId: formData.get("studentId")?.toString() || undefined,
  };

  const parsed = submitHomeworkSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { homeworkId, contentUrl, studentId } = parsed.data;

  if (studentId && studentId !== session.uid) {
    return {
      success: false,
      error: "Forbidden: You can only submit homework for your own account.",
      errors: { auth: ["Forbidden: You can only submit homework for your own account."] },
    };
  }

  await submitOrResubmitStudentWork({
    studentId: session.uid,
    assignmentId: homeworkId,
    contentUrl,
  });
  revalidatePath("/portal/student");
  return { success: true };
}

export async function gradeHomeworkAction(formData: FormData) {
  const session = await requireRole([UserRole.TEACHER]);

  const rawInput = {
    submissionId: formData.get("submissionId")?.toString() || "",
    grade: formData.get("grade")?.toString() || "",
    feedback: formData.get("feedback")?.toString() || "",
  };

  const parsed = gradeHomeworkSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { submissionId, grade, feedback } = parsed.data;

  const repoWithChecks = portalRepository as unknown as {
    checkTeacherAssignment?: (teacherId: string, submissionId: string) => Promise<boolean>;
  };

  let canGrade = false;
  if (typeof repoWithChecks.checkTeacherAssignment === "function") {
    canGrade = await repoWithChecks.checkTeacherAssignment(session.uid, submissionId);
  } else {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        assignment: {
          select: {
            teacherId: true,
            scheduledClass: {
              select: { teacherId: true },
            },
          },
        },
      },
    });
    canGrade = submission?.assignment?.scheduledClass?.teacherId === session.uid;
  }

  if (!canGrade) {
    return {
      success: false,
      error: "Forbidden: You can only grade submissions from your own classes.",
      errors: { auth: ["Forbidden: You can only grade submissions from your own classes."] },
    };
  }

  await gradeHomework(submissionId, grade, feedback || "");
  revalidatePath("/portal/teacher");
  return { success: true };
}
