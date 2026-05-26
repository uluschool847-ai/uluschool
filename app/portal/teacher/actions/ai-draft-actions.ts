"use server";

import { AiDraftStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createReportCommentDraft, reviewAiDraft } from "@/lib/repositories/ai-draft-repository";

const snapshotSchema = z.object({
  snapshotId: z.string().trim().min(1, "Report snapshot is required."),
});

const reviewSchema = z.object({
  draftId: z.string().trim().min(1, "AI draft is required."),
  status: z.enum([AiDraftStatus.APPROVED, AiDraftStatus.REJECTED]),
});

export async function generateReportCommentDraftAction(input: unknown) {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const draft = await createReportCommentDraft(session.uid, parsed.data.snapshotId);
    revalidatePath(`/portal/teacher/reports/${parsed.data.snapshotId}`);
    return { success: true as const, data: draft };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not generate AI draft.",
    };
  }
}

export async function reviewTeacherAiDraftAction(input: unknown) {
  const session = await requireRole([UserRole.TEACHER]);
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const draft = await reviewAiDraft(session.uid, parsed.data.draftId, parsed.data.status);
    revalidatePath("/portal/teacher/reports");
    return { success: true as const, data: draft };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not review AI draft.",
    };
  }
}
