"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import {
  addContactLeadNote,
  updateContactLeadStatus,
} from "@/lib/repositories/contact-lead-repository";
import { addEnquiryNote, updateEnquiryStatus } from "@/lib/repositories/enquiry-repository";

type CrmStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

export async function updateEnquiryStatusAction(input: { id: string; status: CrmStatus }) {
  const session = await requireRole([UserRole.ADMIN]);
  const data = await updateEnquiryStatus({
    id: input.id,
    status: input.status,
    actorId: session.uid,
  });
  revalidatePath(`/admin/enquiries/${input.id}`);
  return { success: true as const, data };
}

export async function updateContactLeadStatusAction(input: { id: string; status: CrmStatus }) {
  const session = await requireRole([UserRole.ADMIN]);
  const data = await updateContactLeadStatus({
    id: input.id,
    status: input.status,
    actorId: session.uid,
  });
  revalidatePath(`/admin/leads/${input.id}`);
  return { success: true as const, data };
}

export async function addEnquiryNoteAction(input: { id: string; content: string }) {
  const session = await requireRole([UserRole.ADMIN]);
  const data = await addEnquiryNote({
    enquiryId: input.id,
    authorId: session.uid,
    content: input.content,
  });
  revalidatePath(`/admin/enquiries/${input.id}`);
  return { success: true as const, data };
}

export async function addContactLeadNoteAction(input: { id: string; content: string }) {
  const session = await requireRole([UserRole.ADMIN]);
  const data = await addContactLeadNote({
    leadId: input.id,
    authorId: session.uid,
    content: input.content,
  });
  revalidatePath(`/admin/leads/${input.id}`);
  return { success: true as const, data };
}
