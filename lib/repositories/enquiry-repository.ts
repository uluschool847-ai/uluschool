import { prisma } from "@/lib/prisma";
import type { EnrolmentInput } from "@/lib/validations/enrolment";

export async function createEnquiry(input: EnrolmentInput) {
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
    },
  });
}
