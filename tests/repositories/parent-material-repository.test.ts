import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
}));

const listStudentCourseMaterialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listStudentCourseMaterials: listStudentCourseMaterialsMock,
}));

type ParentMaterialRepositoryModule = {
  listMaterialsForParentChild: (
    parentId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
};

function loadRepository() {
  const specifier = "@/lib/repositories/parent-material-repository";
  return import(/* @vite-ignore */ specifier) as Promise<ParentMaterialRepositoryModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [
      {
        filename: "factorization-practice.pdf",
        href: "/uploads/materials/factorization-practice.pdf",
        mimeType: "application/pdf",
        size: 2048,
        storageKey: "uploads/materials/factorization-practice.pdf",
      },
    ],
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    description: "Practice examples and teacher notes for the next lesson.",
    fileUrl: "/uploads/materials/algebra-factorization.pdf",
    id: "material-1",
    safeFileUrl: "/uploads/materials/algebra-factorization.pdf",
    scheduledClass: {
      id: "lesson-1",
      startAt: new Date("2026-06-03T10:00:00.000Z"),
      title: "Algebra lesson",
    },
    scheduledClassId: "lesson-1",
    subject: { id: "subject-math", name: "Mathematics" },
    title: "Algebra factorization guide",
    updatedAt: new Date("2026-06-02T10:30:00.000Z"),
    ...overrides,
  };
}

describe("parent material read repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue({
      children: [{ id: "student-1", fullName: "Sofia Shevchenko" }],
      id: "parent-1",
      role: UserRole.PARENT,
    });
    listStudentCourseMaterialsMock.mockResolvedValue([material()]);
  });

  it("exports the dedicated parent material read API", async () => {
    const repository = await loadRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        listMaterialsForParentChild: expect.any(Function),
      }),
    );
  });

  it("lists materials only after verifying the requested child is linked to the parent", async () => {
    const { listMaterialsForParentChild } = await loadRepository();
    const rows = await listMaterialsForParentChild("parent-1", "student-1", {
      search: "factorization",
      subjectId: "subject-math",
    });

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          children: { some: { id: "student-1" } },
          id: "parent-1",
          role: UserRole.PARENT,
        }),
      }),
    );
    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-1", {
      search: "factorization",
      subjectId: "subject-math",
    });
    expect(rows).toEqual([
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "factorization-practice.pdf",
            href: "/uploads/materials/factorization-practice.pdf",
            mimeType: "application/pdf",
            size: 2048,
          }),
        ],
        classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        description: "Practice examples and teacher notes for the next lesson.",
        id: "material-1",
        safeFileUrl: "/uploads/materials/algebra-factorization.pdf",
        scheduledClass: expect.objectContaining({
          id: "lesson-1",
          title: "Algebra lesson",
        }),
        subject: { id: "subject-math", name: "Mathematics" },
        title: "Algebra factorization guide",
        updatedAt: new Date("2026-06-02T10:30:00.000Z"),
      }),
    ]);
  });

  it("preserves materials reached through direct scheduled-class and classGroup enrollment", async () => {
    listStudentCourseMaterialsMock.mockResolvedValueOnce([
      material({
        classGroup: null,
        enrollmentSource: "scheduledClass",
        id: "direct-material",
        scheduledClass: { id: "direct-lesson", title: "Direct algebra lesson" },
        title: "Direct lesson guide",
      }),
      material({
        enrollmentSource: "classGroup",
        id: "group-material",
        scheduledClass: { id: "group-lesson", title: "Group geometry lesson" },
        title: "Group lesson guide",
      }),
    ]);

    const { listMaterialsForParentChild } = await loadRepository();
    const rows = await listMaterialsForParentChild("parent-1", "student-1");

    expect(rows).toEqual([
      expect.objectContaining({
        classGroup: null,
        id: "direct-material",
        scheduledClass: expect.objectContaining({ id: "direct-lesson" }),
      }),
      expect.objectContaining({
        classGroup: expect.objectContaining({ id: "group-1" }),
        id: "group-material",
        scheduledClass: expect.objectContaining({ id: "group-lesson" }),
      }),
    ]);
  });

  it("forwards subject, group, class, search, and sort filters after parent-child verification", async () => {
    const filters = {
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "algebra",
      sort: "classGroup",
      subjectId: "subject-math",
    };

    const { listMaterialsForParentChild } = await loadRepository();
    await listMaterialsForParentChild("parent-1", "student-1", filters);

    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-1", filters);
    expect(JSON.stringify(prismaMock.appUser.findFirst.mock.calls)).not.toContain(
      "foreign-student",
    );
  });

  it.each(["createdAtDesc", "createdAtAsc", "title", "classGroup"])(
    "supports %s sorting through the parent read API",
    async (sort) => {
      const { listMaterialsForParentChild } = await loadRepository();
      await listMaterialsForParentChild("parent-1", "student-1", { sort });

      expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-1", { sort });
    },
  );

  it("keeps safe file and attachment links while leaving unsafe links unavailable", async () => {
    listStudentCourseMaterialsMock.mockResolvedValueOnce([
      material({
        fileUrl: "https://cdn.school/materials/algebra.pdf",
        id: "safe-https",
        safeFileUrl: "https://cdn.school/materials/algebra.pdf",
      }),
      material({
        attachments: [
          {
            filename: "unsafe.html",
            href: null,
            mimeType: "text/html",
            size: 12,
            storageKey: "javascript:alert(2)",
          },
        ],
        fileUrl: "javascript:alert(1)",
        id: "unsafe-material",
        safeFileUrl: null,
        title: "Unsafe material",
      }),
    ]);

    const { listMaterialsForParentChild } = await loadRepository();
    const rows = await listMaterialsForParentChild("parent-1", "student-1");

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "safe-https",
          safeFileUrl: "https://cdn.school/materials/algebra.pdf",
        }),
        expect.objectContaining({
          attachments: [expect.objectContaining({ filename: "unsafe.html", href: null })],
          id: "unsafe-material",
          safeFileUrl: null,
        }),
      ]),
    );
  });

  it("preserves the shared newest-primary mapping for a linked parent view", async () => {
    const primaryKey = "private/teachers/teacher-1/materials/current-parent-view.pdf";
    const tiedCreatedAt = new Date("2026-06-02T09:00:00.000Z");
    listStudentCourseMaterialsMock.mockResolvedValueOnce([
      material({
        fileUrl: "https://cdn.example.com/stale-parent-view.pdf",
        safeFileUrl: storageUrlForKey(primaryKey),
        attachments: [
          {
            id: "attachment-z",
            filename: "current-parent-view.pdf",
            href: storageUrlForKey(primaryKey),
            mimeType: "application/pdf",
            size: 2048,
            storageKey: primaryKey,
            createdAt: tiedCreatedAt,
          },
          {
            id: "attachment-a",
            filename: "old-parent-view.pdf",
            href: storageUrlForKey("private/teachers/teacher-1/materials/old-parent-view.pdf"),
            mimeType: "application/pdf",
            size: 1024,
            storageKey: "private/teachers/teacher-1/materials/old-parent-view.pdf",
            createdAt: tiedCreatedAt,
          },
        ],
      }),
    ]);

    const { listMaterialsForParentChild } = await loadRepository();
    const [row] = await listMaterialsForParentChild("parent-1", "student-1");

    expect(row).toEqual(
      expect.objectContaining({
        safeFileUrl: storageUrlForKey(primaryKey),
        attachments: expect.arrayContaining([
          expect.objectContaining({ href: storageUrlForKey(primaryKey) }),
        ]),
      }),
    );
  });

  it("returns an empty list and does not delegate to student reads for an unlinked child", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { listMaterialsForParentChild } = await loadRepository();
    const rows = await listMaterialsForParentChild("parent-1", "unlinked-student", {
      search: "foreign",
    });

    expect(rows).toEqual([]);
    expect(listStudentCourseMaterialsMock).not.toHaveBeenCalled();
  });
});
