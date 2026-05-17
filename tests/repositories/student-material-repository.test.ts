import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MaterialListItem = {
  scheduledClassId: string;
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    courseMaterial: {
      findMany: vi.fn(),
    },
  },
}));

import { listStudentCourseMaterials } from "@/lib/repositories/portal-repository";

describe("Student material repository access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves only course materials for classes where the student is enrolled", async () => {
    vi.mocked(prisma.courseMaterial.findMany).mockResolvedValue([
      {
        id: "mat-1",
        title: "Forces and Motion Notes",
        description: "Chapter 3 summary",
        fileUrl: "https://cdn.school/materials/forces.pdf",
        scheduledClassId: "class-physics-a",
        scheduledClass: { id: "class-physics-a", title: "IGCSE Physics A" },
      },
      {
        id: "mat-2",
        title: "Cell Biology Slides",
        description: "Lesson slides",
        fileUrl: "https://cdn.school/materials/cell-bio.pdf",
        scheduledClassId: "class-bio-a",
        scheduledClass: { id: "class-bio-a", title: "IGCSE Biology A" },
      },
    ] as never);

    const result = await listStudentCourseMaterials("student-101");

    expect(prisma.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClass: expect.objectContaining({
            students: expect.objectContaining({
              some: { id: "student-101" },
            }),
          }),
        }),
      }),
    );
    expect(result).toHaveLength(2);
  });

  it("strictly excludes materials from classes where the student is not enrolled", async () => {
    vi.mocked(prisma.courseMaterial.findMany).mockResolvedValue([
      {
        id: "mat-10",
        title: "Math Revision Pack",
        description: null,
        fileUrl: "https://cdn.school/materials/math-pack.pdf",
        scheduledClassId: "class-math-owned",
        scheduledClass: { id: "class-math-owned", title: "IGCSE Mathematics" },
      },
    ] as never);

    const result = await listStudentCourseMaterials("student-owned");

    expect(prisma.courseMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClass: expect.objectContaining({
            students: expect.objectContaining({
              some: { id: "student-owned" },
            }),
          }),
        }),
      }),
    );

    expect(
      result.some((item: MaterialListItem) => item.scheduledClassId === "class-history-foreign"),
    ).toBe(false);
  });
});
