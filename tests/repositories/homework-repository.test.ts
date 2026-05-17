import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assignment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  archiveHomeworkAssignment,
  createHomeworkAssignment,
  getHomeworkAssignmentById,
  listHomeworkAssignmentsForTeacherClass,
  updateHomeworkAssignment,
} from "@/lib/repositories/portal-repository";

describe("Homework Repository CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a homework assignment with title, description, classId, and dueDate", async () => {
    const input = {
      title: "Forces and Motion Worksheet",
      description: "Complete sections 1-3.",
      classId: "class-1",
      subjectId: "subject-physics",
      dueDate: new Date("2026-06-15T10:00:00.000Z"),
      teacherId: "teacher-1",
    };

    const created = { id: "hw-1", ...input, archivedAt: null };
    vi.mocked(prisma.assignment.create).mockResolvedValue(created as never);

    const result = await createHomeworkAssignment(input);

    expect(prisma.assignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
        }),
      }),
    );
    expect(result).toEqual(created);
  });

  it("retrieves a single homework assignment by ID for detail page", async () => {
    const assignment = {
      id: "hw-2",
      title: "Algebra Test Prep",
      description: "Solve all questions.",
      dueDate: new Date("2026-06-20T08:00:00.000Z"),
    };
    vi.mocked(prisma.assignment.findUnique).mockResolvedValue(assignment as never);

    const result = await getHomeworkAssignmentById("hw-2", "teacher-1");

    expect(prisma.assignment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "hw-2" },
      }),
    );
    expect(result).toEqual(assignment);
  });

  it("retrieves homework list for a specific class and teacher", async () => {
    const rows = [
      { id: "hw-1", title: "Assignment A" },
      { id: "hw-2", title: "Assignment B" },
    ];
    vi.mocked(prisma.assignment.findMany).mockResolvedValue(rows as never);

    const result = await listHomeworkAssignmentsForTeacherClass("class-1", "teacher-1");

    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClassId: "class-1",
        }),
      }),
    );
    expect(result).toEqual(rows);
  });

  it("updates an existing homework assignment", async () => {
    const updated = {
      id: "hw-3",
      title: "Updated Homework",
      description: "Updated instructions",
      dueDate: new Date("2026-06-25T09:30:00.000Z"),
    };
    vi.mocked(prisma.assignment.update).mockResolvedValue(updated as never);

    const result = await updateHomeworkAssignment("hw-3", "teacher-1", {
      title: updated.title,
      description: updated.description,
      dueDate: updated.dueDate,
    });

    expect(prisma.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "hw-3" },
      }),
    );
    expect(result).toEqual(updated);
  });

  it("archives a homework assignment", async () => {
    const archived = { id: "hw-4", archivedAt: new Date("2026-07-01T00:00:00.000Z") };
    vi.mocked(prisma.assignment.update).mockResolvedValue(archived as never);

    const result = await archiveHomeworkAssignment("hw-4", "teacher-1");

    expect(prisma.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "hw-4" },
      }),
    );
    expect(result).toEqual(archived);
  });

  it("fails gracefully when updating a non-existent assignment ID", async () => {
    vi.mocked(prisma.assignment.update).mockRejectedValue(new Error("Record not found"));

    await expect(
      updateHomeworkAssignment("missing-id", "teacher-1", { title: "New title" }),
    ).rejects.toThrow(/not found/i);
  });

  it("fails gracefully when archiving a non-existent assignment ID", async () => {
    vi.mocked(prisma.assignment.update).mockRejectedValue(new Error("Record not found"));

    await expect(archiveHomeworkAssignment("missing-id", "teacher-1")).rejects.toThrow(
      /not found/i,
    );
  });
});
