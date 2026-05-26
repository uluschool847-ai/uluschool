import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
}));

const studentProgressRepositoryMock = vi.hoisted(() => ({
  listProgressNotesForStudent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => studentProgressRepositoryMock);

type ParentProgressRepository = {
  listProgressNotesForParentChild: (
    parentId: string,
    studentId: string,
    filters?: Record<string, string>,
  ) => Promise<unknown[]>;
};

const importRepository = async (): Promise<ParentProgressRepository> =>
  import(
    "@/lib/repositories/parent-progress-repository" as string
  ) as Promise<ParentProgressRepository>;

const makeProgressNote = (overrides: Record<string, unknown> = {}) => ({
  id: "progress-1",
  studentId: "student-1",
  studentName: "Linked Learner",
  subjectId: "subject-math",
  subject: "Mathematics",
  teacherId: "teacher-1",
  teacherName: "Ada Teacher",
  performanceLevel: "GOOD",
  content: "Algebra reasoning is improving.",
  recordedAt: new Date("2026-02-05T10:00:00.000Z"),
  updatedAt: new Date("2026-02-06T10:00:00.000Z"),
  archivedAt: null,
  statusLabel: "Active",
  ...overrides,
});

describe("parent-progress-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue({ id: "parent-1" });
    studentProgressRepositoryMock.listProgressNotesForStudent.mockResolvedValue([
      makeProgressNote(),
    ]);
  });

  it("exports a dedicated parent progress read API", async () => {
    const repository = await importRepository();

    expect(repository.listProgressNotesForParentChild).toEqual(expect.any(Function));
  });

  it("checks parent-child ownership before reading progress notes", async () => {
    const repository = await importRepository();

    await repository.listProgressNotesForParentChild("parent-1", "student-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith({
      where: {
        id: "parent-1",
        role: UserRole.PARENT,
        children: {
          some: {
            id: "student-1",
          },
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("returns active progress notes for a linked child by default", async () => {
    const repository = await importRepository();

    const rows = await repository.listProgressNotesForParentChild("parent-1", "student-1");

    expect(studentProgressRepositoryMock.listProgressNotesForStudent).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({ status: "active" }),
    );
    expect(rows).toEqual([makeProgressNote()]);
  });

  it("returns an empty list and skips progress reads for an unlinked child", async () => {
    prismaMock.appUser.findFirst.mockResolvedValue(null);
    const repository = await importRepository();

    const rows = await repository.listProgressNotesForParentChild("parent-1", "student-foreign");

    expect(rows).toEqual([]);
    expect(studentProgressRepositoryMock.listProgressNotesForStudent).not.toHaveBeenCalled();
  });

  it("forwards subject, performance, search, status, and sort filters", async () => {
    const repository = await importRepository();
    const filters = {
      subjectId: "subject-math",
      performanceLevel: "STRUGGLING",
      status: "all",
      search: "fractions",
      sort: "performanceLevel",
    };

    await repository.listProgressNotesForParentChild("parent-1", "student-1", filters);

    expect(studentProgressRepositoryMock.listProgressNotesForStudent).toHaveBeenCalledWith(
      "student-1",
      filters,
    );
  });

  it("keeps archived notes hidden unless status is archived or all", async () => {
    studentProgressRepositoryMock.listProgressNotesForStudent.mockResolvedValueOnce([
      makeProgressNote({
        id: "archived-progress",
        archivedAt: new Date("2026-02-10T10:00:00.000Z"),
        statusLabel: "Archived",
      }),
    ]);
    const repository = await importRepository();

    const rows = await repository.listProgressNotesForParentChild("parent-1", "student-1", {
      status: "archived",
    });

    expect(studentProgressRepositoryMock.listProgressNotesForStudent).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({ status: "archived" }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: "archived-progress",
        statusLabel: "Archived",
      }),
    ]);
  });

  it.each(["recordedAtDesc", "recordedAtAsc", "subject", "performanceLevel"])(
    "supports %s sorting",
    async (sort) => {
      const repository = await importRepository();

      await repository.listProgressNotesForParentChild("parent-1", "student-1", { sort });

      expect(studentProgressRepositoryMock.listProgressNotesForStudent).toHaveBeenCalledWith(
        "student-1",
        expect.objectContaining({ sort }),
      );
    },
  );
});
