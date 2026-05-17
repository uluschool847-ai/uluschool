import type { EnquiryStatus } from "@prisma/client";

import type { AttributionInput } from "@/lib/analytics/attribution";
import { prisma } from "@/lib/prisma";
import type { ContactInput } from "@/lib/validations/contact";

export async function createContactLead(
  input: ContactInput & { referenceId?: string },
  attribution?: AttributionInput,
) {
  return prisma.contactLead.create({
    data: {
      referenceId: input.referenceId ?? null,
      fullName: input.fullName,
      email: input.email,
      phoneWhatsapp: input.phoneWhatsapp || null,
      studentGrade: input.studentGrade || null,
      message: input.message,
      utmSource: attribution?.utmSource || null,
      utmMedium: attribution?.utmMedium || null,
      utmCampaign: attribution?.utmCampaign || null,
      referrer: attribution?.referrer || null,
    },
  });
}

export async function listContactLeads(status?: EnquiryStatus) {
  return prisma.contactLead.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getContactLeadById(id: string) {
  return prisma.contactLead.findUnique({
    where: { id },
    select: {
      id: true,
      referenceId: true,
      status: true,
      adminNotes: true,
      updatedAt: true,
    },
  });
}

export async function updateContactLeadReview(
  id: string,
  status: EnquiryStatus,
  adminNotes: string,
) {
  return prisma.contactLead.update({
    where: { id },
    data: {
      status,
      adminNotes: adminNotes.trim() || null,
    },
  });
}

type CrmStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

type FindAllContactLeadsInput = {
  page: number;
  limit: number;
  searchQuery?: string;
  statusFilter?: CrmStatus;
};

function assertValidPagination(page: number, limit: number) {
  if (!Number.isInteger(page) || page <= 0) {
    throw new Error("Invalid pagination: page must be greater than 0");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Invalid pagination: limit must be greater than 0");
  }
}

function assertAdminActor(actorId: string) {
  if (!actorId.toLowerCase().startsWith("admin")) {
    throw new Error("Unauthorized status transition");
  }
}

function assertValidNoteContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Note content is required");
  }

  if (trimmed.length > 5000) {
    throw new Error("Note content exceeds character limit");
  }

  return trimmed;
}

function buildContactLeadWhere(
  input: Pick<FindAllContactLeadsInput, "searchQuery" | "statusFilter">,
) {
  const where: Record<string, unknown> = {};

  if (input.statusFilter) {
    where.status = input.statusFilter;
  }

  const query = input.searchQuery?.trim();
  if (query) {
    where.OR = [
      { fullName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phoneWhatsapp: { contains: query, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function findAllContactLeads(input: FindAllContactLeadsInput) {
  assertValidPagination(input.page, input.limit);

  const where = buildContactLeadWhere(input);
  const [total, data] = await Promise.all([
    prisma.contactLead.count({ where }),
    prisma.contactLead.findMany({
      where,
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        timeline: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return {
    data,
    total,
    page: input.page,
    limit: input.limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
  };
}

export async function getContactLeadCaseById(id: string) {
  return prisma.contactLead.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function updateContactLeadStatus(input: {
  id: string;
  status: CrmStatus;
  actorId: string;
}) {
  assertAdminActor(input.actorId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contactLead.update({
      where: { id: input.id },
      data: { status: input.status as EnquiryStatus },
    });

    await tx.contactLeadTimelineEvent.create({
      data: {
        leadId: input.id,
        type: "STATUS_CHANGED",
        message: `Status changed to ${input.status}`,
        actorId: input.actorId,
        meta: { newValue: input.status },
      },
    });

    return updated;
  });
}

export async function addContactLeadNote(input: {
  leadId: string;
  authorId: string;
  content: string;
}) {
  const content = assertValidNoteContent(input.content);

  return prisma.$transaction(async (tx) => {
    const note = await tx.contactLeadNote.create({
      data: {
        leadId: input.leadId,
        authorId: input.authorId,
        content,
      },
    });

    await tx.contactLeadTimelineEvent.create({
      data: {
        leadId: input.leadId,
        type: "NOTE_CREATED",
        message: "Note added",
        actorId: input.authorId,
        meta: { noteId: note.id },
      },
    });

    return note;
  });
}

export async function getContactLeadTimeline(leadId: string) {
  return prisma.contactLeadTimelineEvent.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
  });
}
