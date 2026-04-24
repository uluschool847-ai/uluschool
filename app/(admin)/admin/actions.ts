"use server";

import { EnquiryStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { getContactLeadById, updateContactLeadReview } from "@/lib/repositories/contact-lead-repository";
import { getEnquiryById, updateEnquiryReview } from "@/lib/repositories/enquiry-repository";
import { processDueReminders } from "@/lib/services/reminders";

function parseStatus(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;

  const normalized = value.toUpperCase();
  if (
    normalized !== EnquiryStatus.NEW &&
    normalized !== EnquiryStatus.IN_REVIEW &&
    normalized !== EnquiryStatus.ACCEPTED &&
    normalized !== EnquiryStatus.REJECTED
  ) {
    return null;
  }

  return normalized;
}

export async function updateEnquiryAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const id = String(formData.get("id") || "");
  const status = parseStatus(formData.get("status"));
  const adminNotes = String(formData.get("adminNotes") || "");

  if (!id || !status) {
    return;
  }

  const before = await getEnquiryById(id);
  const after = await updateEnquiryReview(id, status, adminNotes);
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
}

export async function updateContactLeadAction(formData: FormData) {
  const session = await requireRole([UserRole.ADMIN]);

  const id = String(formData.get("id") || "");
  const status = parseStatus(formData.get("status"));
  const adminNotes = String(formData.get("adminNotes") || "");

  if (!id || !status) {
    return;
  }

  const before = await getContactLeadById(id);
  const after = await updateContactLeadReview(id, status, adminNotes);
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
