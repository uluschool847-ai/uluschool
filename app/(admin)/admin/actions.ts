"use server";

import { EnquiryStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  getContactLeadById,
  updateContactLeadReview,
} from "@/lib/repositories/contact-lead-repository";
import { getEnquiryById, updateEnquiryReview } from "@/lib/repositories/enquiry-repository";
import { processDueReminders } from "@/lib/services/reminders";

import { z } from "zod";

const updateReviewSchema = z.object({
  id: z.string().min(1, "ID is required"),
  status: z.nativeEnum(EnquiryStatus, {
    required_error: "Status is required",
    invalid_type_error: "Invalid status",
  }),
  adminNotes: z.string().optional(),
});

export type ReminderDispatchState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateEnquiryAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const rawInput = {
    id: formData.get("id"),
    status: formData.get("status")?.toString().toUpperCase(),
    adminNotes: formData.get("adminNotes") || "",
  };

  const parsed = updateReviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { id, status, adminNotes } = parsed.data;

  const before = await getEnquiryById(id);
  const after = await updateEnquiryReview(id, status, adminNotes || "");
  await createAdminAuditLog({
    adminUserId: session.uid,
    action: "ENQUIRY_REVIEW_UPDATED",
    targetType: "Enquiry",
    targetId: id,
    before,
    after: {
      id: after.id,
      status: after.status,
      adminNotes: after.adminNotes,
      convertedAt: after.convertedAt,
      updatedAt: after.updatedAt,
    },
  });
  revalidatePath("/admin");
  return { success: true };
}

export async function updateContactLeadAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const rawInput = {
    id: formData.get("id"),
    status: formData.get("status")?.toString().toUpperCase(),
    adminNotes: formData.get("adminNotes") || "",
  };

  const parsed = updateReviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { id, status, adminNotes } = parsed.data;

  const before = await getContactLeadById(id);
  const after = await updateContactLeadReview(id, status, adminNotes || "");
  await createAdminAuditLog({
    adminUserId: session.uid,
    action: "CONTACT_REVIEW_UPDATED",
    targetType: "ContactLead",
    targetId: id,
    before,
    after: {
      id: after.id,
      status: after.status,
      adminNotes: after.adminNotes,
      updatedAt: after.updatedAt,
    },
  });
  revalidatePath("/admin");
  return { success: true };
}

function getReminderDispatchFormData(
  stateOrFormData?: ReminderDispatchState | FormData,
  formData?: FormData,
) {
  return formData ?? (stateOrFormData instanceof FormData ? stateOrFormData : undefined);
}

function formatReminderDispatchSuccess(
  result: Awaited<ReturnType<typeof processDueReminders>>,
  dryRun: boolean,
) {
  const scanned = `${result.scannedClasses} classes and ${result.scannedAssignments} assignments`;
  if (dryRun) {
    return `Dry run completed. ${result.wouldSend ?? 0} reminders would be sent after scanning ${scanned}.`;
  }

  return `Reminder job completed. Sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped} after scanning ${scanned}.`;
}

export async function runReminderDispatchAction(
  stateOrFormData?: ReminderDispatchState | FormData,
  formData?: FormData,
): Promise<ReminderDispatchState> {
  const session = await requireRole([UserRole.ADMIN]);
  const dispatchFormData = getReminderDispatchFormData(stateOrFormData, formData);
  const dryRun = dispatchFormData?.get("dryRun")?.toString() === "true";

  try {
    const result = await processDueReminders({ dryRun });
    console.info("Manual reminder dispatch result", result);
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: dryRun ? "REMINDER_DISPATCH_DRY_RUN" : "REMINDER_DISPATCH_MANUAL_RUN",
      targetType: "ReminderJob",
      meta: result,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/reminders");
    return {
      status: "success",
      message: formatReminderDispatchSuccess(result, dryRun),
    };
  } catch (error) {
    console.error("Manual reminder dispatch failed", error);
    return {
      status: "error",
      message:
        "Reminder job failed. No success audit was written. Try again or check the server logs.",
    };
  }
}
