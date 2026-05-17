import { EnquiryStatus } from "@prisma/client";

import type { AttributionInput } from "@/lib/analytics/attribution";
import { prisma } from "@/lib/prisma";
import type { EnrolmentInput } from "@/lib/validations/enrolment";

export async function createEnquiry(
  input: EnrolmentInput & { referenceId?: string },
  attribution?: AttributionInput,
) {
  const level = await prisma.level.findFirst({
    where: {
      OR: [{ slug: input.curriculumLevel }, { name: input.curriculumLevel }],
    },
    select: { id: true },
  });

  if (!level) {
    throw new Error("Curriculum level not found.");
  }

  return prisma.enquiry.create({
    data: {
      referenceId: input.referenceId ?? null,
      studentName: input.studentName,
      ageYearLevel: input.ageYearLevel,
      subjects: input.subjects,
      curriculumLevelId: level.id,
      parentGuardianName: input.parentGuardianName,
      email: input.email,
      phoneWhatsapp: input.phoneWhatsapp,
      preferredSchedule: input.preferredSchedule,
      additionalNotes: input.additionalNotes || null,
      utmSource: attribution?.utmSource || null,
      utmMedium: attribution?.utmMedium || null,
      utmCampaign: attribution?.utmCampaign || null,
      referrer: attribution?.referrer || null,
    },
  });
}

export async function listEnquiries(status?: EnquiryStatus) {
  return prisma.enquiry.findMany({
    where: status ? { status } : undefined,
    include: {
      curriculumLevel: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getEnquiryById(id: string) {
  return prisma.enquiry.findUnique({
    where: { id },
    select: {
      id: true,
      referenceId: true,
      status: true,
      adminNotes: true,
      convertedAt: true,
      updatedAt: true,
    },
  });
}

export async function updateEnquiryReview(id: string, status: EnquiryStatus, adminNotes: string) {
  return prisma.enquiry.update({
    where: { id },
    data: {
      status,
      adminNotes: adminNotes.trim() || null,
      convertedAt: status === EnquiryStatus.CONVERTED ? new Date() : null,
    },
  });
}

type CrmStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

type FindAllEnquiriesInput = {
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

function buildEnquiryWhere(input: Pick<FindAllEnquiriesInput, "searchQuery" | "statusFilter">) {
  const where: Record<string, unknown> = {};

  if (input.statusFilter) {
    where.status = input.statusFilter;
  }

  const query = input.searchQuery?.trim();
  if (query) {
    where.OR = [
      { studentName: { contains: query, mode: "insensitive" } },
      { parentGuardianName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phoneWhatsapp: { contains: query, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function findAllEnquiries(input: FindAllEnquiriesInput) {
  assertValidPagination(input.page, input.limit);

  const where = buildEnquiryWhere(input);
  const [total, data] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
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

export async function getEnquiryCaseById(id: string) {
  return prisma.enquiry.findUnique({
    where: { id },
    include: {
      notes: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function updateEnquiryStatus(input: {
  id: string;
  status: CrmStatus;
  actorId: string;
}) {
  assertAdminActor(input.actorId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.enquiry.update({
      where: { id: input.id },
      data: { status: input.status as EnquiryStatus },
    });

    await tx.enquiryTimelineEvent.create({
      data: {
        entityId: input.id,
        type: "STATUS_CHANGED",
        message: `Status changed to ${input.status}`,
        actorId: input.actorId,
        meta: { newValue: input.status },
      },
    });

    return updated;
  });
}

export async function addEnquiryNote(input: {
  enquiryId: string;
  authorId: string;
  content: string;
}) {
  const content = assertValidNoteContent(input.content);

  return prisma.$transaction(async (tx) => {
    const note = await tx.enquiryNote.create({
      data: {
        entityId: input.enquiryId,
        authorId: input.authorId,
        content,
      },
    });

    await tx.enquiryTimelineEvent.create({
      data: {
        entityId: input.enquiryId,
        type: "NOTE_CREATED",
        message: "Note added",
        actorId: input.authorId,
        meta: { noteId: note.id },
      },
    });

    return note;
  });
}

export async function getEnquiryTimeline(enquiryId: string) {
  return prisma.enquiryTimelineEvent.findMany({
    where: { entityId: enquiryId },
    orderBy: { createdAt: "asc" },
  });
}
