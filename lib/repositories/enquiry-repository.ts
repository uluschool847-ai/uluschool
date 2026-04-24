import { EnquiryStatus } from "@prisma/client";

import type { AttributionInput } from "@/lib/analytics/attribution";
import { prisma } from "@/lib/prisma";
import type { EnrolmentInput } from "@/lib/validations/enrolment";

export async function createEnquiry(input: EnrolmentInput, attribution?: AttributionInput) {
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
      convertedAt: status === EnquiryStatus.ACCEPTED ? new Date() : null,
    },
  });
}
