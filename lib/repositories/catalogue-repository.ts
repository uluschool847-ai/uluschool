import { prisma } from "@/lib/prisma";

export type CatalogueSubject = {
  id: string;
  slug: string;
  name: string;
};

export type CatalogueLevel = {
  id: string;
  slug: string;
  name: string;
};

export async function getSubjects(): Promise<CatalogueSubject[]> {
  return prisma.subject.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });
}

export async function getLevels(): Promise<CatalogueLevel[]> {
  return prisma.level.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });
}

export async function getCatalogueData() {
  const [subjects, levels] = await Promise.all([getSubjects(), getLevels()]);

  return {
    subjects,
    levels,
  };
}
