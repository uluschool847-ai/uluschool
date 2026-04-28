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
    invalid_type_error: "Invalid status" 
  }),
  adminNotes: z.string().optional(),
});

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

export async function runReminderDispatchAction() {
  const session = await requireRole([UserRole.ADMIN]);
  const result = await processDueReminders();
  console.info("Manual reminder dispatch result", result);
  await createAdminAuditLog({
    adminUserId: session.uid,
    action: "REMINDER_DISPATCH_MANUAL_RUN",
    targetType: "ReminderJob",
    meta: result,
  });
  revalidatePath("/admin");
}
