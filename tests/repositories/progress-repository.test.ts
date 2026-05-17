import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentProgress: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    scheduledClass: {
      findFirst: vi.fn(),
    },
  },
}));

import {
  archiveProgressNote,
  createProgressNote,
  listProgressNotesForStudentSubject,
  listProgressNotesForTeacherStudentSubject,
  updateProgressNote,
} from "@/lib/repositories/portal-repository";

describe("Progress repository - teacher progress-note workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a progress note with studentId, teacherId, subjectId, content, and performanceLevel", async () => {
    const payload = {
      studentId: "student-101",
      teacherId: "teacher-123",
      subjectId: "subject-123",
      content: "Student improved solving equations this week.",
      performanceLevel: "GOOD",
    };

    vi.mocked(prisma.studentProgress.create).mockResolvedValue({
      id: "note-1",
      studentId: payload.studentId,
      subjectId: payload.subjectId,
      teacherNotes: payload.content,
      gradeLevel: payload.performanceLevel,
      recordedAt: new Date(),
    } as never);
    vi.mocked(prisma.scheduledClass.findFirst).mockResolvedValue({
      id: "class-owned-by-teacher",
    } as never);

    const result = await createProgressNote(payload);

    expect(prisma.scheduledClass.findFirst).toHaveBeenCalledWith({
      where: {
        teacherId: payload.teacherId,
        students: {
          some: { id: payload.studentId },
        },
      },
      select: { id: true },
    });
    expect(prisma.studentProgress.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: payload.studentId,
          subjectId: payload.subjectId,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "note-1" }));
  });

  it("retrieves progress notes for a specific student and subject", async () => {
    vi.mocked(prisma.studentProgress.findMany).mockResolvedValue([
      {
        id: "note-1",
        studentId: "student-101",
        subjectId: "subject-123",
        teacherNotes: "Steady progress.",
        gradeLevel: "GOOD",
      },
      {
        id: "note-2",
        studentId: "student-101",
        subjectId: "subject-123",
        teacherNotes: "Needs more revision on geometry.",
        gradeLevel: "STRUGGLING",
      },
    ] as never);

    const result = await listProgressNotesForStudentSubject({
      studentId: "student-101",
      subjectId: "subject-123",
    });

    expect(prisma.studentProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "student-101",
          subjectId: "subject-123",
        }),
      }),
    );
    expect(result).toHaveLength(2);
  });

  it("updates an existing progress note", async () => {
    vi.mocked(prisma.studentProgress.update).mockResolvedValue({
      id: "note-1",
      teacherNotes: "Updated note content",
      gradeLevel: "EXCELLENT",
    } as never);

    const result = await updateProgressNote("note-1", "teacher-123", {
      content: "Updated note content",
      performanceLevel: "EXCELLENT",
    });

    expect(prisma.studentProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note-1" },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "note-1" }));
  });

  it("deletes or archives an existing progress note", async () => {
    vi.mocked(prisma.studentProgress.delete).mockResolvedValue({
      id: "note-1",
    } as never);

    const result = await archiveProgressNote("note-1", "teacher-123");

    expect(prisma.studentProgress.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note-1" },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "note-1" }));
  });

  it("allows retrieval only for students in classes belonging to the teacher", async () => {
    vi.mocked(prisma.scheduledClass.findFirst).mockResolvedValue(null as never);

    await expect(
      listProgressNotesForTeacherStudentSubject({
        teacherId: "teacher-foreign",
        studentId: "student-101",
        subjectId: "subject-123",
      }),
    ).rejects.toThrow(/forbidden|unauthorized|not allowed|not found/i);

    expect(prisma.studentProgress.findMany).not.toHaveBeenCalled();
  });
});
