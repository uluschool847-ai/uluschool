import { prisma } from "@/lib/prisma";

export async function getSubmissionsForStudent(assignmentId: string, studentId: string) {
  return prisma.submission.findMany({
    where: {
      assignmentId,
      studentId,
    },
  });
}

export async function findById(assignmentId: string) {
  return prisma.assignment.findUnique({
    where: { id: assignmentId },
  });
}
