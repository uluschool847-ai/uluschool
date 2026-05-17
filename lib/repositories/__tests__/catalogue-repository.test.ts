import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  subject: {
    findMany: vi.fn(),
  },
  level: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type CatalogueRepositoryModule = {
  getSubjects: () => Promise<
    Array<{
      id: string;
      slug: string;
      name: string;
      isActive: boolean;
      priority: number;
    }>
  >;
  getLevels: () => Promise<
    Array<{
      id: string;
      slug: string;
      name: string;
    }>
  >;
  getCatalogueData: () => Promise<{
    subjects: Array<{
      id: string;
      slug: string;
      name: string;
      isActive: boolean;
      priority: number;
    }>;
    levels: Array<{
      id: string;
      slug: string;
      name: string;
    }>;
  }>;
};

async function loadCatalogueRepository() {
  const specifier = "@/lib/repositories/catalogue-repository";
  return import(/* @vite-ignore */ specifier) as Promise<CatalogueRepositoryModule>;
}

describe("catalogue-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSubjects returns only active subjects in public display order", async () => {
    prismaMock.subject.findMany.mockResolvedValueOnce([
      { id: "subject-1", slug: "biology", name: "Biology", isActive: true, priority: 1 },
      { id: "subject-2", slug: "chemistry", name: "Chemistry", isActive: true, priority: 2 },
    ]);

    const { getSubjects } = await loadCatalogueRepository();
    const result = await getSubjects();

    expect(prismaMock.subject.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ priority: "asc" }, { name: "asc" }],
    });
    expect(result.map((subject) => subject.name)).toEqual(["Biology", "Chemistry"]);
  });

  it("getLevels returns levels from the database ordered for enrolment and catalogue use", async () => {
    prismaMock.level.findMany.mockResolvedValueOnce([
      { id: "level-1", slug: "grade-5", name: "Grade 5" },
      { id: "level-2", slug: "grade-6", name: "Grade 6" },
    ]);

    const { getLevels } = await loadCatalogueRepository();
    const result = await getLevels();

    expect(prismaMock.level.findMany).toHaveBeenCalledWith({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });
    expect(result.map((level) => level.name)).toEqual(["Grade 5", "Grade 6"]);
  });

  it("getCatalogueData combines active subjects and levels for a single page-level fetch", async () => {
    prismaMock.subject.findMany.mockResolvedValueOnce([
      { id: "subject-1", slug: "biology", name: "Biology", isActive: true, priority: 1 },
    ]);
    prismaMock.level.findMany.mockResolvedValueOnce([
      { id: "level-1", slug: "grade-5", name: "Grade 5" },
    ]);

    const { getCatalogueData } = await loadCatalogueRepository();
    const result = await getCatalogueData();

    expect(prismaMock.subject.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.level.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      subjects: [
        { id: "subject-1", slug: "biology", name: "Biology", isActive: true, priority: 1 },
      ],
      levels: [{ id: "level-1", slug: "grade-5", name: "Grade 5" }],
    });
  });
});
