"use server";

import { AiDraftStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createCrmFollowUpDraft, reviewAiDraft } from "@/lib/repositories/ai-draft-repository";

const enquirySchema = z.object({
  enquiryId: z.string().trim().min(1, "Enquiry is required."),
});

const reviewSchema = z.object({
  draftId: z.string().trim().min(1, "AI draft is required."),
  status: z.enum([AiDraftStatus.APPROVED, AiDraftStatus.REJECTED]),
});

export async function generateCrmFollowUpDraftAction(input: unknown) {
  const session = await requireRole([UserRole.ADMIN]);
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const draft = await createCrmFollowUpDraft(session.uid, parsed.data.enquiryId);
    revalidatePath("/admin");
    return { success: true as const, data: draft };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not generate CRM draft.",
    };
  }
}

export async function reviewAdminAiDraftAction(input: unknown) {
  const session = await requireRole([UserRole.ADMIN]);
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const draft = await reviewAiDraft(session.uid, parsed.data.draftId, parsed.data.status);
    revalidatePath("/admin");
    return { success: true as const, data: draft };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not review AI draft.",
    };
  }
}
