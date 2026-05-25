import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appUser: {
      findFirst: vi.fn(),
    },
    studentProgress: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    scheduledClass: {
      findFirst: vi.fn(),
    },
    subject: {
      findFirst: vi.fn(),
    },
  },
}));

type StudentProgressRepositoryModule = {
  listProgressNotesForTeacher: (
    teacherId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listProgressNotesForTeacherStudent: (
    teacherId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  getProgressNoteForTeacher: (teacherId: string, progressNoteId: string) => Promise<unknown>;
  createProgressNoteForTeacher: (input: Record<string, unknown>) => Promise<unknown>;
  updateProgressNoteForTeacher: (
    progressNoteId: string,
    teacherId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  archiveProgressNoteForTeacher: (progressNoteId: string, teacherId: string) => Promise<unknown>;
  listProgressNotesForStudent: (
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listProgressNotesForParentChild: (
    parentId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  assertTeacherCanWriteProgressForStudent: (
    teacherId: string,
    studentId: string,
    subjectId?: string,
  ) => Promise<unknown>;
};

function loadStudentProgressRepository() {
  const specifier = "@/lib/repositories/student-progress-repository";
  return import(/* @vite-ignore */ specifier) as Promise<StudentProgressRepositoryModule>;
}

function progressNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "progress-1",
    studentId: "student-101",
    teacherId: "teacher-123",
    subjectId: "subject-123",
    teacherNotes: "Strong algebra progress.",
    gradeLevel: "GOOD",
    recordedAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    archivedAt: null,
    subject: { id: "subject-123", name: "Algebra" },
    teacher: { id: "teacher-123", fullName: "Teacher One" },
    ...overrides,
  };
}

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

describe("student-progress-repository ownership and lifecycle contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports the dedicated progress repository API", async () => {
    const repository = await loadStudentProgressRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        listProgressNotesForTeacherStudent: expect.any(Function),
        listProgressNotesForTeacher: expect.any(Function),
        getProgressNoteForTeacher: expect.any(Function),
        createProgressNoteForTeacher: expect.any(Function),
        updateProgressNoteForTeacher: expect.any(Function),
        archiveProgressNoteForTeacher: expect.any(Function),
        listProgressNotesForStudent: expect.any(Function),
        listProgressNotesForParentChild: expect.any(Function),
        assertTeacherCanWriteProgressForStudent: expect.any(Function),
      }),
    );
  });

  it("allows teacher progress writes through direct lesson enrollment or classGroup enrollment", async () => {
    vi.mocked(prisma.appUser.findFirst).mockResolvedValueOnce({
      id: "teacher-123",
      role: "TEACHER",
    } as never);
    vi.mocked(prisma.subject.findFirst).mockResolvedValueOnce({ id: "subject-123" } as never);
    vi.mocked(prisma.scheduledClass.findFirst).mockResolvedValueOnce({
      id: "direct-lesson",
    } as never);
    vi.mocked(prisma.studentProgress.create).mockResolvedValueOnce(progressNote() as never);

    const { createProgressNoteForTeacher } = await loadStudentProgressRepository();
    await createProgressNoteForTeacher({
      teacherId: "teacher-123",
      submittedTeacherId: "teacher-spoof",
      studentId: "student-101",
      subjectId: "subject-123",
      content: "  Strong algebra progress.  ",
      performanceLevel: "GOOD",
    });

    expect(prisma.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              teacherId: "teacher-123",
              students: { some: { id: "student-101" } },
            },
            {
              classGroup: {
                teacherId: "teacher-123",
                students: { some: { id: "student-101" } },
              },
            },
          ]),
        }),
      }),
    );
    expect(prisma.studentProgress.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teacherId: "teacher-123",
          studentId: "student-101",
          subjectId: "subject-123",
          teacherNotes: "Strong algebra progress.",
          gradeLevel: "GOOD",
        }),
      }),
    );
    expect(JSON.stringify(vi.mocked(prisma.studentProgress.create).mock.calls[0][0])).not.toContain(
      "teacher-spoof",
    );
  });

  it("rejects progress writes for unassigned students before creating a note", async () => {
    vi.mocked(prisma.appUser.findFirst).mockResolvedValueOnce({
      id: "teacher-123",
      role: "TEACHER",
    } as never);
    vi.mocked(prisma.subject.findFirst).mockResolvedValueOnce({ id: "subject-123" } as never);
    vi.mocked(prisma.scheduledClass.findFirst).mockResolvedValueOnce(null as never);

    const { createProgressNoteForTeacher } = await loadStudentProgressRepository();

    await expect(
      createProgressNoteForTeacher({
        teacherId: "teacher-123",
        studentId: "student-unassigned",
        subjectId: "subject-123",
        content: "Progress outside teacher scope.",
        performanceLevel: "GOOD",
      }),
    ).rejects.toThrow(/unauthorized|not assigned|forbidden/i);
    expect(prisma.studentProgress.create).not.toHaveBeenCalled();
  });

  it("validates required fields, content max length, subject existence, and performanceLevel", async () => {
    const { createProgressNoteForTeacher } = await loadStudentProgressRepository();

    await expect(
      createProgressNoteForTeacher({
        teacherId: "teacher-123",
        studentId: "",
        subjectId: "subject-123",
        content: "Valid content",
        performanceLevel: "GOOD",
      }),
    ).rejects.toThrow(/student|required/i);
    await expect(
      createProgressNoteForTeacher({
        teacherId: "teacher-123",
        studentId: "student-101",
        subjectId: "",
        content: "Valid content",
        performanceLevel: "GOOD",
      }),
    ).rejects.toThrow(/subject|required/i);
    await expect(
      createProgressNoteForTeacher({
        teacherId: "teacher-123",
        studentId: "student-101",
        subjectId: "subject-123",
        content: "x".repeat(2001),
        performanceLevel: "GOOD",
      }),
    ).rejects.toThrow(/content|2000/i);
    await expect(
      createProgressNoteForTeacher({
        teacherId: "teacher-123",
        studentId: "student-101",
        subjectId: "subject-123",
        content: "Valid content",
        performanceLevel: "AVERAGE",
      }),
    ).rejects.toThrow(/performance|level/i);
    expect(prisma.studentProgress.create).not.toHaveBeenCalled();
  });

  it("updates and archives only notes owned by the session teacher using soft archive", async () => {
    vi.mocked(prisma.studentProgress.findFirst)
      .mockResolvedValueOnce(progressNote() as never)
      .mockResolvedValueOnce(progressNote() as never);
    vi.mocked(prisma.studentProgress.update)
      .mockResolvedValueOnce(progressNote({ teacherNotes: "Updated progress." }) as never)
      .mockResolvedValueOnce(
        progressNote({ archivedAt: new Date("2026-06-02T10:00:00.000Z") }) as never,
      );

    const { updateProgressNoteForTeacher, archiveProgressNoteForTeacher } =
      await loadStudentProgressRepository();

    await updateProgressNoteForTeacher("progress-1", "teacher-123", {
      content: "Updated progress.",
      performanceLevel: "EXCELLENT",
    });
    await archiveProgressNoteForTeacher("progress-1", "teacher-123");

    expect(prisma.studentProgress.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "progress-1",
          teacherId: "teacher-123",
        }),
      }),
    );
    expect(prisma.studentProgress.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "progress-1" },
        data: expect.objectContaining({
          archivedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.studentProgress.delete).not.toHaveBeenCalled();
  });

  it("excludes archived notes from active lists and includes them with history filter", async () => {
    vi.mocked(prisma.scheduledClass.findFirst).mockResolvedValue({ id: "lesson-1" } as never);
    vi.mocked(prisma.studentProgress.findMany).mockResolvedValueOnce([progressNote()] as never);

    const { listProgressNotesForTeacherStudent } = await loadStudentProgressRepository();
    await listProgressNotesForTeacherStudent("teacher-123", "student-101", {
      status: "active",
      subjectId: "subject-123",
    });
    await listProgressNotesForTeacherStudent("teacher-123", "student-101", {
      status: "archived",
    });

    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          studentId: "student-101",
          teacherId: "teacher-123",
          subjectId: "subject-123",
        }),
      }),
    );
    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: { not: null },
          studentId: "student-101",
          teacherId: "teacher-123",
        }),
      }),
    );
  });

  it("lists all teacher progress notes through teacher scope with filters, search, and default active status", async () => {
    vi.mocked(prisma.studentProgress.findMany).mockResolvedValueOnce([
      progressNote({
        student: {
          id: "student-101",
          fullName: "Amina Yusuf",
          email: "amina@example.com",
        },
      }),
    ] as never);

    const { listProgressNotesForTeacher } = await loadStudentProgressRepository();
    const result = await listProgressNotesForTeacher("teacher-123", {
      performanceLevel: "GOOD",
      search: "Amina equations",
      sort: "studentName",
      studentId: "student-101",
      subjectId: "subject-123",
    });

    expect(prisma.studentProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          gradeLevel: "GOOD",
          studentId: "student-101",
          subjectId: "subject-123",
          teacherId: "teacher-123",
          OR: expect.arrayContaining([
            { teacherNotes: expect.objectContaining({ contains: "Amina equations" }) },
            {
              student: expect.objectContaining({
                OR: expect.arrayContaining([
                  { fullName: expect.objectContaining({ contains: "Amina equations" }) },
                  { email: expect.objectContaining({ contains: "Amina equations" }) },
                ]),
              }),
            },
          ]),
        }),
        orderBy: expect.any(Array),
      }),
    );
    expect(
      JSON.stringify(vi.mocked(prisma.studentProgress.findMany).mock.calls[0][0]),
    ).not.toContain("foreign-teacher");
    expect(result[0]).toEqual(
      expect.objectContaining({
        archivedAt: null,
        contentPreview: expect.stringContaining("Strong algebra"),
        href: "/portal/teacher/students/student-101/progress",
        performanceLevel: "GOOD",
        statusLabel: "Active",
        student: expect.objectContaining({
          email: "amina@example.com",
          id: "student-101",
          name: "Amina Yusuf",
        }),
        subject: expect.objectContaining({
          id: "subject-123",
          name: "Algebra",
        }),
      }),
    );
  });

  it("supports archived/all status filters, valid sorting, and returns no rows for a foreign student filter", async () => {
    vi.mocked(prisma.studentProgress.findMany)
      .mockResolvedValueOnce([
        progressNote({ archivedAt: new Date("2026-06-02T10:00:00.000Z") }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    const { listProgressNotesForTeacher } = await loadStudentProgressRepository();
    await listProgressNotesForTeacher("teacher-123", {
      status: "archived",
      sort: "recordedAtAsc",
    });
    await listProgressNotesForTeacher("teacher-123", {
      status: "all",
      sort: "performanceLevel",
      studentId: "foreign-student",
    });

    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: { not: null },
          teacherId: "teacher-123",
        }),
        orderBy: [{ recordedAt: "asc" }],
      }),
    );
    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "foreign-student",
          teacherId: "teacher-123",
        }),
      }),
    );
  });

  it("scopes student and parent progress visibility to own or linked-child non-archived notes", async () => {
    vi.mocked(prisma.studentProgress.findMany)
      .mockResolvedValueOnce([progressNote({ studentId: "student-101" })] as never)
      .mockResolvedValueOnce([progressNote({ studentId: "child-1" })] as never);

    const { listProgressNotesForStudent, listProgressNotesForParentChild } =
      await loadStudentProgressRepository();

    await listProgressNotesForStudent("student-101");
    await listProgressNotesForParentChild("parent-1", "child-1");

    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "student-101",
          archivedAt: null,
        }),
      }),
    );
    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "child-1",
          archivedAt: null,
          student: {
            parents: {
              some: { id: "parent-1" },
            },
          },
        }),
      }),
    );
  });

  it("lists student progress notes through strict student scope with filters, search, sort, and active default", async () => {
    vi.mocked(prisma.studentProgress.findMany).mockResolvedValueOnce([
      progressNote({
        gradeLevel: "GOOD",
        subject: { id: "subject-123", name: "Algebra" },
        teacher: { id: "teacher-123", fullName: "Teacher One" },
      }),
    ] as never);

    const { listProgressNotesForStudent } = await loadStudentProgressRepository();
    const result = await listProgressNotesForStudent("student-101", {
      performanceLevel: "GOOD",
      search: "algebra teacher",
      sort: "teacher",
      status: "active",
      subjectId: "subject-123",
    });

    expect(prisma.studentProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          subject: expect.any(Object),
          teacher: expect.any(Object),
        }),
        orderBy: expect.any(Array),
        where: expect.objectContaining({
          archivedAt: null,
          gradeLevel: "GOOD",
          studentId: "student-101",
          subjectId: "subject-123",
          OR: expect.arrayContaining([
            { teacherNotes: expect.objectContaining({ contains: "algebra teacher" }) },
            {
              subject: expect.objectContaining({
                name: expect.objectContaining({ contains: "algebra teacher" }),
              }),
            },
            {
              teacher: expect.objectContaining({
                fullName: expect.objectContaining({ contains: "algebra teacher" }),
              }),
            },
          ]),
        }),
      }),
    );
    expect(
      JSON.stringify(vi.mocked(prisma.studentProgress.findMany).mock.calls[0][0]),
    ).not.toContain("foreign-student");
    expect(result[0]).toEqual(
      expect.objectContaining({
        archivedAt: null,
        content: "Strong algebra progress.",
        performanceLevel: "GOOD",
        statusLabel: "Active",
        subject: expect.objectContaining({ id: "subject-123", name: "Algebra" }),
        teacher: expect.objectContaining({ id: "teacher-123", name: "Teacher One" }),
        teacherName: "Teacher One",
      }),
    );
  });

  it("supports archived/all student progress filters and ignores invalid status, sort, and performance filters", async () => {
    vi.mocked(prisma.studentProgress.findMany)
      .mockResolvedValueOnce([
        progressNote({ archivedAt: new Date("2026-06-02T10:00:00.000Z") }),
      ] as never)
      .mockResolvedValueOnce([progressNote()] as never)
      .mockResolvedValueOnce([progressNote()] as never);

    const { listProgressNotesForStudent } = await loadStudentProgressRepository();
    await listProgressNotesForStudent("student-101", {
      status: "archived",
      sort: "recordedAtAsc",
    });
    await listProgressNotesForStudent("student-101", {
      status: "all",
      sort: "performanceLevel",
    });
    await listProgressNotesForStudent("student-101", {
      performanceLevel: "AVERAGE",
      sort: "drop table",
      status: "deleted",
    });

    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: [{ recordedAt: "asc" }],
        where: expect.objectContaining({
          archivedAt: { not: null },
          studentId: "student-101",
        }),
      }),
    );
    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: [{ gradeLevel: "asc" }, { recordedAt: "desc" }],
        where: expect.not.objectContaining({ archivedAt: expect.anything() }),
      }),
    );
    expect(prisma.studentProgress.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        orderBy: [{ recordedAt: "desc" }],
        where: expect.objectContaining({
          archivedAt: null,
          studentId: "student-101",
        }),
      }),
    );
    expect(
      JSON.stringify(vi.mocked(prisma.studentProgress.findMany).mock.calls[2][0]),
    ).not.toContain("AVERAGE");
    expect(
      JSON.stringify(vi.mocked(prisma.studentProgress.findMany).mock.calls[2][0]),
    ).not.toContain("drop table");
  });
});
