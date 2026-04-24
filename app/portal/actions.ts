"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import { gradeHomework, submitHomework } from "@/lib/repositories/portal-repository";

export async function submitHomeworkAction(formData: FormData) {
  const session = await requireRole([UserRole.STUDENT]);
  
  const homeworkId = formData.get("homeworkId") as string;
  const contentUrl = formData.get("contentUrl") as string; // Could be a link to a file upload

  if (!homeworkId || !contentUrl) {
    throw new Error("Missing required fields");
  }

  await submitHomework(session.uid, homeworkId, contentUrl);
  revalidatePath("/portal/student");
}

export async function gradeHomeworkAction(formData: FormData) {
  await requireRole([UserRole.TEACHER]);
  
  const submissionId = formData.get("submissionId") as string;
  const grade = formData.get("grade") as string;
  const feedback = formData.get("feedback") as string;

  if (!submissionId || !grade) {
    throw new Error("Missing required fields");
  }

  await gradeHomework(submissionId, grade, feedback);
  revalidatePath("/portal/teacher");
}
