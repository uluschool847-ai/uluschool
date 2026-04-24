import { EnquiryStatus } from "@prisma/client";

import type { AttributionInput } from "@/lib/analytics/attribution";
import { prisma } from "@/lib/prisma";
import type { ContactInput } from "@/lib/validations/contact";

export async function createContactLead(input: ContactInput, attribution?: AttributionInput) {
  return prisma.contactLead.create({
    data: {
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
