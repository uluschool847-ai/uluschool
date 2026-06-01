"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  addContactLeadNote,
  getContactLeadById,
  updateContactLeadStatus,
} from "@/lib/repositories/contact-lead-repository";
import {
  addEnquiryNote,
  getEnquiryById,
  updateEnquiryStatus,
} from "@/lib/repositories/enquiry-repository";

type CrmStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

const statusSchema = z.object({
  id: z.string().trim().min(1, "Case ID is required."),
  status: z.enum(["NEW", "IN_PROGRESS", "CONVERTED", "REJECTED"]),
});

const noteSchema = z.object({
  id: z.string().trim().min(1, "Case ID is required."),
  content: z.string().trim().min(1, "Note is required."),
});

function revalidateEnquiryPaths(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/enquiries/${id}`);
}

function revalidateLeadPaths(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
}

export async function updateEnquiryStatusAction(input: { id: string; status: CrmStatus }) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Invalid enquiry status update." };
  }

  try {
    const session = await requireRole([UserRole.ADMIN]);
    const before = await getEnquiryById(parsed.data.id);
    const data = await updateEnquiryStatus({
      id: parsed.data.id,
      status: parsed.data.status,
      actorId: session.uid,
    });
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "ENQUIRY_STATUS_UPDATED",
      targetType: "Enquiry",
      targetId: parsed.data.id,
      before,
      after: {
        id: data.id,
        status: data.status,
        updatedAt: data.updatedAt,
      },
      meta: { actorRole: UserRole.ADMIN },
    });
    revalidateEnquiryPaths(parsed.data.id);
    return { success: true as const, data, message: "Status updated" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update enquiry status.",
    };
  }
}

export async function updateContactLeadStatusAction(input: { id: string; status: CrmStatus }) {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Invalid lead status update." };
  }

  try {
    const session = await requireRole([UserRole.ADMIN]);
    const before = await getContactLeadById(parsed.data.id);
    const data = await updateContactLeadStatus({
      id: parsed.data.id,
      status: parsed.data.status,
      actorId: session.uid,
    });
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "CONTACT_LEAD_STATUS_UPDATED",
      targetType: "ContactLead",
      targetId: parsed.data.id,
      before,
      after: {
        id: data.id,
        status: data.status,
        updatedAt: data.updatedAt,
      },
      meta: { actorRole: UserRole.ADMIN },
    });
    revalidateLeadPaths(parsed.data.id);
    return { success: true as const, data, message: "Status updated" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update lead status.",
    };
  }
}

export async function addEnquiryNoteAction(input: { id: string; content: string }) {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Note is required" };
  }

  try {
    const session = await requireRole([UserRole.ADMIN]);
    const data = await addEnquiryNote({
      enquiryId: parsed.data.id,
      authorId: session.uid,
      content: parsed.data.content,
    });
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "ENQUIRY_NOTE_ADDED",
      targetType: "Enquiry",
      targetId: parsed.data.id,
      before: null,
      after: {
        id: data.id,
        contentLength: data.content.length,
        createdAt: data.createdAt,
      },
      meta: { actorRole: UserRole.ADMIN, noteId: data.id },
    });
    revalidateEnquiryPaths(parsed.data.id);
    return { success: true as const, data, message: "Note added" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not add enquiry note.",
    };
  }
}

export async function addContactLeadNoteAction(input: { id: string; content: string }) {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Note is required" };
  }

  try {
    const session = await requireRole([UserRole.ADMIN]);
    const data = await addContactLeadNote({
      leadId: parsed.data.id,
      authorId: session.uid,
      content: parsed.data.content,
    });
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "CONTACT_LEAD_NOTE_ADDED",
      targetType: "ContactLead",
      targetId: parsed.data.id,
      before: null,
      after: {
        id: data.id,
        contentLength: data.content.length,
        createdAt: data.createdAt,
      },
      meta: { actorRole: UserRole.ADMIN, noteId: data.id },
    });
    revalidateLeadPaths(parsed.data.id);
    return { success: true as const, data, message: "Note added" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not add lead note.",
    };
  }
}
