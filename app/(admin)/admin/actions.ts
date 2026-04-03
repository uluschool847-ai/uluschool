"use server";

import { EnquiryStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { updateContactLeadReview } from "@/lib/repositories/contact-lead-repository";
import { updateEnquiryReview } from "@/lib/repositories/enquiry-repository";

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
  const id = String(formData.get("id") || "");
  const status = parseStatus(formData.get("status"));
  const adminNotes = String(formData.get("adminNotes") || "");

  if (!id || !status) {
    return;
  }

  await updateEnquiryReview(id, status, adminNotes);
  revalidatePath("/admin");
}

export async function updateContactLeadAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = parseStatus(formData.get("status"));
  const adminNotes = String(formData.get("adminNotes") || "");

  if (!id || !status) {
    return;
  }

  await updateContactLeadReview(id, status, adminNotes);
  revalidatePath("/admin");
}
