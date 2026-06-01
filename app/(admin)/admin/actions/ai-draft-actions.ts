"use server";

import { AiDraftStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { createCrmFollowUpDraft, reviewAiDraft } from "@/lib/repositories/ai-draft-repository";

const enquirySchema = z.object({
  enquiryId: z.string().trim().min(1, "Enquiry is required."),
});

const reviewSchema = z.object({
  draftId: z.string().trim().min(1, "AI draft is required."),
  status: z.enum([AiDraftStatus.APPROVED, AiDraftStatus.REJECTED]),
});

function aiDraftSnapshot(draft: {
  id: string;
  type?: string | null;
  status?: string | null;
  createdById?: string | null;
  reviewedById?: string | null;
  relatedEnquiryId?: string | null;
  relatedReportSnapshotId?: string | null;
}) {
  return {
    id: draft.id,
    type: draft.type ?? null,
    status: draft.status ?? null,
    createdById: draft.createdById ?? null,
    reviewedById: draft.reviewedById ?? null,
    relatedEnquiryId: draft.relatedEnquiryId ?? null,
    relatedReportSnapshotId: draft.relatedReportSnapshotId ?? null,
  };
}

function redirectToAiDrafts(params: { message?: string; error?: string }) {
  const searchParams = new URLSearchParams();
  if (params.message) searchParams.set("aiDraftMessage", params.message);
  if (params.error) searchParams.set("aiDraftError", params.error);
  redirect(`/admin/ai-drafts?${searchParams.toString()}`);
}

export async function generateCrmFollowUpDraftAction(input: unknown) {
  const session = await requireRole([UserRole.ADMIN]);
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  try {
    const draft = await createCrmFollowUpDraft(session.uid, parsed.data.enquiryId);
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "AI_DRAFT_CREATED",
      targetType: "ai_draft",
      targetId: draft.id,
      before: null,
      after: aiDraftSnapshot(draft),
      meta: { actorRole: UserRole.ADMIN, enquiryId: parsed.data.enquiryId },
    });
    revalidatePath("/admin/ai-drafts");
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
    const beforeDraft = await prisma.aiDraft.findUnique({
      where: { id: parsed.data.draftId },
      select: {
        createdById: true,
        id: true,
        relatedEnquiryId: true,
        relatedReportSnapshotId: true,
        reviewedById: true,
        status: true,
        type: true,
      },
    });
    const draft = await reviewAiDraft(session.uid, parsed.data.draftId, parsed.data.status);
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "AI_DRAFT_REVIEWED",
      targetType: "ai_draft",
      targetId: draft.id,
      before: beforeDraft ? aiDraftSnapshot(beforeDraft) : null,
      after: aiDraftSnapshot(draft),
      meta: { actorRole: UserRole.ADMIN, reviewStatus: parsed.data.status },
    });
    revalidatePath("/admin/ai-drafts");
    return { success: true as const, data: draft };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not review AI draft.",
    };
  }
}

export async function generateCrmFollowUpDraftFormAction(formData: FormData) {
  const result = await generateCrmFollowUpDraftAction({
    enquiryId: formData.get("enquiryId")?.toString() ?? "",
  });

  if (result.success) {
    redirectToAiDrafts({ message: "CRM draft generated." });
  }

  redirectToAiDrafts({
    error: typeof result.error === "string" ? result.error : "Could not generate CRM draft.",
  });
}

export async function reviewAdminAiDraftFormAction(formData: FormData) {
  const result = await reviewAdminAiDraftAction({
    draftId: formData.get("draftId")?.toString() ?? "",
    status: formData.get("status")?.toString() ?? "",
  });

  if (result.success) {
    redirectToAiDrafts({ message: `AI draft ${result.data.status.toLowerCase()}.` });
  }

  redirectToAiDrafts({
    error: typeof result.error === "string" ? result.error : "Could not review AI draft.",
  });
}
