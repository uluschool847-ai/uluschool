import { prisma } from "@/lib/prisma";
import type { EnquiryStatus } from "@prisma/client";

type GetSubmissionsInput = {
  entityType: "enquiry" | "lead";
  search?: string;
  page?: number;
  limit?: number;
  status?: EnquiryStatus | null;
};

function buildSearchWhere(entityType: GetSubmissionsInput["entityType"], search?: string) {
  const query = search?.trim();

  if (!query) {
    return {};
  }

  const contains = { contains: query, mode: "insensitive" as const };

  if (entityType === "enquiry") {
    return {
      OR: [
        { referenceId: contains },
        { studentName: contains },
        { parentGuardianName: contains },
        { email: contains },
        { phoneWhatsapp: contains },
      ],
    };
  }

  return {
    OR: [
      { referenceId: contains },
      { fullName: contains },
      { email: contains },
      { phoneWhatsapp: contains },
      { studentGrade: contains },
      { message: contains },
    ],
  };
}

export async function getSubmissions(input: GetSubmissionsInput) {
  const where = {
    ...buildSearchWhere(input.entityType, input.search),
    ...(input.status ? { status: input.status } : {}),
  };
  const shouldPaginate = input.page !== undefined || input.limit !== undefined;
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.max(1, input.limit ?? 20);
  const skip = (page - 1) * limit;

  if (input.entityType === "enquiry") {
    if (shouldPaginate) {
      return prisma.enquiry.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      });
    }

    return prisma.enquiry.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  if (shouldPaginate) {
    return prisma.contactLead.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
  }

  return prisma.contactLead.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { createdAt: "desc" },
  });
}
