import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  courseMaterial: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type MaterialListItem = {
  id: string;
  scheduledClassId: string;
};

type CourseMaterialRepositoryModule = {
  listParentChildCourseMaterials: (
    parentId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<MaterialListItem[]>;
  listStudentCourseMaterials: (
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<MaterialListItem[]>;
};

function loadCourseMaterialRepository() {
  const specifier = "@/lib/repositories/course-material-repository";
  return import(/* @vite-ignore */ specifier) as Promise<CourseMaterialRepositoryModule>;
}

function material(overrides: Partial<MaterialListItem> & Record<string, unknown> = {}) {
  return {
    id: "mat-1",
    title: "Forces and Motion Notes",
    description: "Chapter 3 summary",
    fileUrl: "https://cdn.school/materials/forces.pdf",
    attachments: [
      {
        id: "attachment-1",
        filename: "forces-lab.pdf",
        storageKey: "uploads/materials/forces-lab.pdf",
        mimeType: "application/pdf",
        size: 1024,
      },
    ],
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    updatedAt: new Date("2026-06-02T09:00:00.000Z"),
    scheduledClassId: "class-physics-a",
    scheduledClass: {
      id: "class-physics-a",
      title: "IGCSE Physics A",
      startAt: new Date("2026-06-03T10:00:00.000Z"),
      subject: { id: "subject-physics", name: "Physics" },
      classGroup: { id: "group-physics-a", name: "Physics A" },
    },
    ...overrides,
  };
}

describe("Student and parent course material repository access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retrieves materials for direct ScheduledClass enrollment and classGroup enrollment", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material({ id: "mat-direct", scheduledClassId: "class-direct" }),
      material({ id: "mat-group", scheduledClassId: "class-group" }),
    ]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    const result = await listStudentCourseMaterials("student-101");

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClass: expect.objectContaining({
            OR: expect.arrayContaining([
              { students: { some: { id: "student-101" } } },
              { classGroup: { students: { some: { id: "student-101" } } } },
            ]),
          }),
        }),
      }),
    );
    expect(result).toHaveLength(2);
  });

  it("strictly excludes materials from classes and groups where the student is not enrolled", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material({ id: "mat-owned", scheduledClassId: "class-owned" }),
    ]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    const result = await listStudentCourseMaterials("student-owned");

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClass: expect.objectContaining({
            OR: expect.arrayContaining([
              { students: { some: { id: "student-owned" } } },
              { classGroup: { students: { some: { id: "student-owned" } } } },
            ]),
          }),
        }),
      }),
    );
    expect(result.some((item) => item.scheduledClassId === "class-history-foreign")).toBe(false);
  });

  it("forwards supported student material filters without accepting a foreign student scope", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    await listStudentCourseMaterials("student-session", {
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "chemistry",
      sort: "title",
      studentId: "student-other",
      subjectId: "subject-chem",
    });

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClassId: "lesson-1",
          scheduledClass: expect.objectContaining({
            classGroupId: "group-1",
            subjectId: "subject-chem",
            OR: expect.arrayContaining([
              { students: { some: { id: "student-session" } } },
              { classGroup: { students: { some: { id: "student-session" } } } },
            ]),
          }),
        }),
      }),
    );
    const query = JSON.stringify(prismaMock.courseMaterial.findMany.mock.calls[0][0]);
    expect(query).toContain("student-session");
    expect(query).not.toContain("student-other");
  });

  it("searches material, lesson, group, and subject text where supported", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    await listStudentCourseMaterials("student-101", { search: "bonding" });

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { title: { contains: "bonding", mode: "insensitive" } },
            { description: { contains: "bonding", mode: "insensitive" } },
            { scheduledClass: { title: { contains: "bonding", mode: "insensitive" } } },
            {
              scheduledClass: {
                classGroup: { name: { contains: "bonding", mode: "insensitive" } },
              },
            },
            {
              scheduledClass: {
                subject: { name: { contains: "bonding", mode: "insensitive" } },
              },
            },
          ]),
        }),
      }),
    );
  });

  it.each([
    ["createdAtDesc", [{ createdAt: "desc" }, { title: "asc" }]],
    ["createdAtAsc", [{ createdAt: "asc" }, { title: "asc" }]],
    ["title", [{ title: "asc" }]],
    ["classGroup", [{ scheduledClass: { classGroup: { name: "asc" } } }, { title: "asc" }]],
    ["subject", [{ scheduledClass: { subject: { name: "asc" } } }, { title: "asc" }]],
  ])("supports %s sorting for student materials", async (sort, expectedOrderBy) => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    await listStudentCourseMaterials("student-101", { sort });

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: expectedOrderBy }),
    );
  });

  it("returns material context, attachments, dates, and safe file hrefs in the view model", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material(),
      material({
        id: "mat-unsafe",
        title: "Unsafe link",
        fileUrl: "javascript:alert(1)",
        attachments: [
          {
            id: "attachment-unsafe",
            filename: "unsafe.html",
            storageKey: "javascript:alert(2)",
            mimeType: "text/html",
            size: 12,
          },
        ],
      }),
    ]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    const result = await listStudentCourseMaterials("student-101");

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          attachments: expect.anything(),
          scheduledClass: expect.objectContaining({
            select: expect.objectContaining({
              classGroup: expect.anything(),
              id: true,
              startAt: true,
              subject: expect.anything(),
              title: true,
            }),
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: "forces-lab.pdf",
              href: "/uploads/materials/forces-lab.pdf",
              mimeType: "application/pdf",
              size: 1024,
            }),
          ],
          classGroup: { id: "group-physics-a", name: "Physics A" },
          createdAt: new Date("2026-06-01T09:00:00.000Z"),
          safeFileUrl: "https://cdn.school/materials/forces.pdf",
          scheduledClass: expect.objectContaining({
            id: "class-physics-a",
            startAt: new Date("2026-06-03T10:00:00.000Z"),
            title: "IGCSE Physics A",
          }),
          subject: { id: "subject-physics", name: "Physics" },
          updatedAt: new Date("2026-06-02T09:00:00.000Z"),
        }),
      ]),
    );
    expect(result.find((item) => item.id === "mat-unsafe")).toEqual(
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: "unsafe.html", href: null })],
        safeFileUrl: null,
      }),
    );
  });

  it("does not accept a client-supplied student scope different from the session student", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([]);

    const { listStudentCourseMaterials } = await loadCourseMaterialRepository();
    await listStudentCourseMaterials("student-session", { studentId: "student-other" });

    const query = JSON.stringify(prismaMock.courseMaterial.findMany.mock.calls[0][0]);
    expect(query).toContain("student-session");
    expect(query).not.toContain("student-other");
  });

  it("parent sees materials only for a linked child through direct and classGroup enrollment", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material({ id: "mat-child", scheduledClassId: "class-child" }),
    ]);

    const { listParentChildCourseMaterials } = await loadCourseMaterialRepository();
    const result = await listParentChildCourseMaterials("parent-1", "student-child");

    expect(prismaMock.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClass: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                students: {
                  some: {
                    id: "student-child",
                    parents: { some: { id: "parent-1" } },
                  },
                },
              },
              {
                classGroup: {
                  students: {
                    some: {
                      id: "student-child",
                      parents: { some: { id: "parent-1" } },
                    },
                  },
                },
              },
            ]),
          }),
        }),
      }),
    );
    expect(result).toEqual([expect.objectContaining({ id: "mat-child" })]);
  });

  it("parent cannot see materials for an unlinked student", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([]);

    const { listParentChildCourseMaterials } = await loadCourseMaterialRepository();
    const result = await listParentChildCourseMaterials("parent-1", "student-unlinked");

    const query = JSON.stringify(prismaMock.courseMaterial.findMany.mock.calls[0][0]);
    expect(query).toContain("parent-1");
    expect(query).toContain("student-unlinked");
    expect(result).toEqual([]);
  });
});
