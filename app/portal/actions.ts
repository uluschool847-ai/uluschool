"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { gradeHomework, submitHomework } from "@/lib/repositories/portal-repository";

import { z } from "zod";

const submitHomeworkSchema = z.object({
  homeworkId: z.string().min(1, "Homework ID is required"),
  contentUrl: z.string().url("Valid Content URL is required").min(1, "Content URL is required"),
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
  };

  const parsed = submitHomeworkSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { homeworkId, contentUrl } = parsed.data;

  await submitHomework(session.uid, homeworkId, contentUrl);
  revalidatePath("/portal/student");
  return { success: true };
}

export async function gradeHomeworkAction(formData: FormData) {
  await requireRole([UserRole.TEACHER]);

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

  // Assume gradeHomework accepts grade as string to match old signature, or handles number
  await gradeHomework(submissionId, grade.toString(), feedback || "");
  revalidatePath("/portal/teacher");
  return { success: true };
}
