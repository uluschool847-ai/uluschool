import { prisma } from "@/lib/prisma";

export async function getRoster(classId: string) {
  const scheduledClass = await prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: { students: true },
  });
  return scheduledClass?.students || [];
}

export async function findById(classId: string) {
  return prisma.scheduledClass.findUnique({
    where: { id: classId },
  });
}
