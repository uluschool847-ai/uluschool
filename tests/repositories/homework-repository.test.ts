import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assignment: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
  },
  subject: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type HomeworkRepositoryModule = {
  createHomeworkAssignment: (input: Record<string, unknown>) => Promise<unknown>;
  updateHomeworkAssignment: (
    id: string,
    teacherId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  archiveHomeworkAssignment: (id: string, teacherId: string) => Promise<unknown>;
  getHomeworkAssignmentById: (id: string, teacherId: string) => Promise<unknown>;
  listHomeworkAssignmentsForTeacher: (
    teacherId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listHomeworkAssignmentsForTeacherClass: (
    teacherId: string,
    classOrGroupId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  assertTeacherOwnsAssignment: (teacherId: string, assignmentId: string) => Promise<unknown>;
  assertTeacherOwnsClassForHomework: (
    teacherId: string,
    scheduledClassId: string,
  ) => Promise<unknown>;
};

function loadHomeworkRepository() {
  const specifier = "@/lib/repositories/homework-repository";
  return import(/* @vite-ignore */ specifier) as Promise<HomeworkRepositoryModule>;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic homework",
    description: "Solve questions 1-10.",
    dueDate: new Date("2026-07-10T10:00:00.000Z"),
    scheduledClassId: "lesson-1",
    subjectId: "subject-math",
    teacherId: "teacher-1",
    archivedAt: null,
    submissions: [],
    scheduledClass: {
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: { id: "group-1", teacherId: "teacher-1" },
    },
    ...overrides,
  };
}

const createInput = {
  title: "Quadratic homework",
  description: "Solve questions 1-10.",
  dueDate: new Date("2026-07-10T10:00:00.000Z"),
  scheduledClassId: "lesson-1",
  subjectId: "subject-math",
  teacherId: "teacher-1",
};

describe("homework-repository ownership contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.subject.findUnique.mockResolvedValue({ id: "subject-math" });
  });

  it("exports the dedicated homework repository API instead of relying on portal-repository", async () => {
    const repository = await loadHomeworkRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        createHomeworkAssignment: expect.any(Function),
        updateHomeworkAssignment: expect.any(Function),
        archiveHomeworkAssignment: expect.any(Function),
        getHomeworkAssignmentById: expect.any(Function),
        listHomeworkAssignmentsForTeacher: expect.any(Function),
        listHomeworkAssignmentsForTeacherClass: expect.any(Function),
        assertTeacherOwnsAssignment: expect.any(Function),
        assertTeacherOwnsClassForHomework: expect.any(Function),
      }),
    );
  });

  it("creates homework for a directly owned ScheduledClass and writes teacherId from trusted session context", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: null,
    });
    prismaMock.assignment.create.mockResolvedValueOnce(assignment());

    const { createHomeworkAssignment } = await loadHomeworkRepository();
    await createHomeworkAssignment({
      ...createInput,
      clientTeacherId: "teacher-2",
    });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "lesson-1",
          OR: expect.arrayContaining([
            { teacherId: "teacher-1" },
            { classGroup: { teacherId: "teacher-1" } },
          ]),
        }),
      }),
    );
    expect(prismaMock.assignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledClassId: "lesson-1",
          teacherId: "teacher-1",
          title: "Quadratic homework",
          dueDate: createInput.dueDate,
        }),
      }),
    );
    expect(JSON.stringify(prismaMock.assignment.create.mock.calls[0][0])).not.toContain(
      "teacher-2",
    );
  });

  it("creates homework for a classGroup-owned ScheduledClass even when ScheduledClass.teacherId is null", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce({
      id: "lesson-1",
      teacherId: null,
      classGroup: { id: "group-1", teacherId: "teacher-1" },
    });
    prismaMock.assignment.create.mockResolvedValueOnce(assignment({ teacherId: "teacher-1" }));

    const { createHomeworkAssignment } = await loadHomeworkRepository();
    const result = await createHomeworkAssignment(createInput);

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ classGroup: { teacherId: "teacher-1" } }]),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "assignment-1" }));
  });

  it("rejects homework creation for another teacher's class and does not create an assignment", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { createHomeworkAssignment } = await loadHomeworkRepository();

    await expect(
      createHomeworkAssignment({ ...createInput, scheduledClassId: "foreign-lesson" }),
    ).rejects.toThrow(/unauthorized|not found|not assigned|ownership/i);
    expect(prismaMock.assignment.create).not.toHaveBeenCalled();
  });

  it("updates and archives only assignments owned through assignment, scheduledClass, or classGroup scope", async () => {
    prismaMock.assignment.findFirst
      .mockResolvedValueOnce(assignment())
      .mockResolvedValueOnce(assignment());
    prismaMock.assignment.update
      .mockResolvedValueOnce(assignment({ title: "Updated homework" }))
      .mockResolvedValueOnce(assignment({ archivedAt: new Date("2026-07-01T00:00:00.000Z") }));

    const { updateHomeworkAssignment, archiveHomeworkAssignment } = await loadHomeworkRepository();

    await updateHomeworkAssignment("assignment-1", "teacher-1", {
      title: "Updated homework",
      dueDate: new Date("2026-07-12T10:00:00.000Z"),
    });
    await archiveHomeworkAssignment("assignment-1", "teacher-1");

    expect(prismaMock.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "assignment-1",
          OR: expect.arrayContaining([
            { teacherId: "teacher-1" },
            { scheduledClass: { teacherId: "teacher-1" } },
            { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
          ]),
        }),
      }),
    );
    expect(prismaMock.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "assignment-1" },
        data: expect.objectContaining({ title: "Updated homework" }),
      }),
    );
    expect(prismaMock.assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "assignment-1" },
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
  });

  it("rejects update/archive for another teacher's assignment before mutation", async () => {
    prismaMock.assignment.findFirst.mockResolvedValue(null);

    const { updateHomeworkAssignment, archiveHomeworkAssignment } = await loadHomeworkRepository();

    await expect(
      updateHomeworkAssignment("foreign-assignment", "teacher-1", { title: "Nope" }),
    ).rejects.toThrow(/unauthorized|not found|not owned/i);
    await expect(archiveHomeworkAssignment("foreign-assignment", "teacher-1")).rejects.toThrow(
      /unauthorized|not found|not owned/i,
    );
    expect(prismaMock.assignment.update).not.toHaveBeenCalled();
  });

  it("keeps active and archived homework lists scoped to the current teacher", async () => {
    prismaMock.assignment.findMany
      .mockResolvedValueOnce([assignment()])
      .mockResolvedValueOnce([assignment({ archivedAt: new Date("2026-07-01T00:00:00.000Z") })]);

    const { listHomeworkAssignmentsForTeacher, listHomeworkAssignmentsForTeacherClass } =
      await loadHomeworkRepository();

    await listHomeworkAssignmentsForTeacher("teacher-1", { status: "active" });
    await listHomeworkAssignmentsForTeacherClass("teacher-1", "group-1", { status: "archived" });

    expect(prismaMock.assignment.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          OR: expect.arrayContaining([
            { teacherId: "teacher-1" },
            { scheduledClass: { teacherId: "teacher-1" } },
            { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
          ]),
        }),
      }),
    );
    expect(prismaMock.assignment.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: { not: null },
          OR: expect.arrayContaining([
            { scheduledClassId: "group-1" },
            { scheduledClass: { classGroupId: "group-1" } },
          ]),
        }),
      }),
    );
  });

  it("preserves submissions when archiving and rejects edits to archived assignments", async () => {
    const archived = assignment({
      archivedAt: new Date("2026-07-01T00:00:00.000Z"),
      submissions: [{ id: "submission-1" }],
    });
    prismaMock.assignment.findFirst.mockResolvedValueOnce(archived);

    const { updateHomeworkAssignment } = await loadHomeworkRepository();

    await expect(
      updateHomeworkAssignment("assignment-1", "teacher-1", { title: "Changed after archive" }),
    ).rejects.toThrow(/archived/i);
    expect(prismaMock.assignment.update).not.toHaveBeenCalled();
  });

  it.each([
    ["title", "", /title|required/i],
    ["scheduledClassId", "", /class|lesson|required/i],
    ["dueDate", new Date("invalid"), /due date|valid/i],
  ])("validates homework input field %s", async (field, value, message) => {
    const { createHomeworkAssignment } = await loadHomeworkRepository();

    await expect(createHomeworkAssignment({ ...createInput, [field]: value })).rejects.toThrow(
      message,
    );
    expect(prismaMock.assignment.create).not.toHaveBeenCalled();
  });
});
