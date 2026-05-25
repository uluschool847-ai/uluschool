import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assignment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type StudentAssignmentRepositoryModule = {
  listAssignmentsForStudent: (
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  getAssignmentDetailForStudent: (
    studentId: string,
    assignmentId: string,
  ) => Promise<Record<string, unknown> | null>;
};

function loadRepository() {
  const specifier = "@/lib/repositories/submission-repository";
  return import(/* @vite-ignore */ specifier) as Promise<StudentAssignmentRepositoryModule>;
}

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic equations",
    description: "Solve questions 1-10 from the workbook.",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    archivedAt: null,
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    scheduledClass: {
      id: "lesson-1",
      title: "Algebra lesson",
      startAt: new Date("2026-06-18T10:00:00.000Z"),
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
      classGroup: {
        id: "group-1",
        name: "IGCSE Mathematics A",
        students: [{ id: "student-1" }],
      },
      students: [{ id: "student-1" }],
      courseMaterials: [
        {
          id: "material-1",
          title: "Lesson notes",
          fileUrl: "/uploads/materials/lesson-notes.pdf",
          attachments: [],
        },
      ],
    },
    submissions: [],
    ...overrides,
  };
}

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    studentId: "student-1",
    assignmentId: "assignment-1",
    contentUrl: "https://drive.example.com/work-v1",
    grade: null,
    feedback: null,
    submittedAt: new Date("2026-06-19T18:00:00.000Z"),
    updatedAt: new Date("2026-06-19T18:00:00.000Z"),
    attachments: [],
    ...overrides,
  };
}

describe("student assignment read repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the dedicated student assignment read API from submission-repository", async () => {
    const repository = await loadRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        listAssignmentsForStudent: expect.any(Function),
        getAssignmentDetailForStudent: expect.any(Function),
      }),
    );
  });

  it("lists active assignments for the session student through direct class or class-group enrollment", async () => {
    prismaMock.assignment.findMany.mockResolvedValueOnce([
      assignmentRow({
        submissions: [submissionRow()],
      }),
    ]);

    const { listAssignmentsForStudent } = await loadRepository();
    const rows = await listAssignmentsForStudent("student-1", { status: "active" });

    expect(prismaMock.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          OR: expect.arrayContaining([
            { scheduledClass: { students: { some: { id: "student-1" } } } },
            { scheduledClass: { classGroup: { students: { some: { id: "student-1" } } } } },
          ]),
        }),
        include: expect.objectContaining({
          submissions: expect.objectContaining({
            where: { studentId: "student-1" },
            orderBy: { submittedAt: "desc" },
          }),
        }),
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        id: "assignment-1",
        status: "Submitted",
        detailHref: "/portal/student/assignments/assignment-1",
      }),
    ]);
  });

  it("excludes archived assignments from the default active list and includes them only for archived/all filters", async () => {
    prismaMock.assignment.findMany.mockResolvedValue([]);

    const { listAssignmentsForStudent } = await loadRepository();
    await listAssignmentsForStudent("student-1", {});
    await listAssignmentsForStudent("student-1", { status: "archived" });
    await listAssignmentsForStudent("student-1", { status: "all" });

    const defaultWhere = prismaMock.assignment.findMany.mock.calls[0][0].where;
    const archivedWhere = prismaMock.assignment.findMany.mock.calls[1][0].where;
    const allWhere = prismaMock.assignment.findMany.mock.calls[2][0].where;

    expect(defaultWhere).toEqual(expect.objectContaining({ archivedAt: null }));
    expect(archivedWhere.archivedAt).toEqual(expect.objectContaining({ not: null }));
    expect(allWhere).not.toHaveProperty("archivedAt");
  });

  it.each([
    ["submitted", { submissions: { some: { studentId: "student-1" } } }],
    ["graded", { submissions: { some: { studentId: "student-1", grade: { not: null } } } }],
    ["missing", { dueDate: { lt: expect.any(Date) } }],
  ])("applies %s status inside the student enrollment scope", async (status, expectedWhere) => {
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);

    const { listAssignmentsForStudent } = await loadRepository();
    await listAssignmentsForStudent("student-1", { status });

    const where = prismaMock.assignment.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining(expectedWhere));
    expect(JSON.stringify(where)).toContain("student-1");
  });

  it("forwards subject, group, class, search, due date, and sort filters without widening ownership", async () => {
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);

    const { listAssignmentsForStudent } = await loadRepository();
    await listAssignmentsForStudent("student-1", {
      classGroupId: "group-1",
      dueFrom: "2026-06-01",
      dueTo: "2026-06-30",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "dueDateAsc",
      subjectId: "subject-math",
    });

    const query = prismaMock.assignment.findMany.mock.calls[0][0];
    const whereText = JSON.stringify(query.where);

    expect(whereText).toContain("student-1");
    expect(whereText).toContain("group-1");
    expect(whereText).toContain("lesson-1");
    expect(whereText).toContain("subject-math");
    expect(whereText).toContain("quadratic");
    expect(query.orderBy).toEqual(expect.arrayContaining([{ dueDate: "asc" }]));
  });

  it.each([
    ["dueDateAsc", [{ dueDate: "asc" }]],
    ["dueDateDesc", [{ dueDate: "desc" }]],
    ["title", [{ title: "asc" }]],
    ["status", expect.any(Array)],
  ])("supports %s sorting", async (sort, expectedOrderBy) => {
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);

    const { listAssignmentsForStudent } = await loadRepository();
    await listAssignmentsForStudent("student-1", { sort });

    expect(prismaMock.assignment.findMany.mock.calls[0][0].orderBy).toEqual(expectedOrderBy);
  });

  it("does not return assignments from another student", async () => {
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);

    const { listAssignmentsForStudent } = await loadRepository();
    await expect(listAssignmentsForStudent("student-1", { search: "foreign" })).resolves.toEqual(
      [],
    );

    const whereText = JSON.stringify(prismaMock.assignment.findMany.mock.calls[0][0].where);
    expect(whereText).toContain("student-1");
    expect(whereText).not.toContain("student-2");
  });

  it("returns null for a missing or foreign assignment detail", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(null);

    const { getAssignmentDetailForStudent } = await loadRepository();
    const detail = await getAssignmentDetailForStudent("student-1", "foreign-assignment");

    expect(detail).toBeNull();
    expect(prismaMock.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "foreign-assignment",
          OR: expect.arrayContaining([
            { scheduledClass: { students: { some: { id: "student-1" } } } },
            { scheduledClass: { classGroup: { students: { some: { id: "student-1" } } } } },
          ]),
        }),
      }),
    );
  });

  it("returns the assignment detail view model with safe links and submission state", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(
      assignmentRow({
        submissions: [
          submissionRow({
            grade: 91,
            feedback: "Clear method. Check final notation.",
            attachments: [
              {
                id: "attachment-1",
                filename: "solution.pdf",
                storageKey: "submissions/solution.pdf",
              },
            ],
          }),
          submissionRow({
            id: "submission-previous",
            contentUrl: "javascript:alert(1)",
            submittedAt: new Date("2026-06-18T18:00:00.000Z"),
          }),
        ],
      }),
    );

    const { getAssignmentDetailForStudent } = await loadRepository();
    const detail = await getAssignmentDetailForStudent("student-1", "assignment-1");

    expect(detail).toEqual(
      expect.objectContaining({
        id: "assignment-1",
        title: "Quadratic equations",
        archivedAt: null,
        canSubmit: true,
        canResubmit: true,
        subject: expect.objectContaining({ id: "subject-math", name: "Mathematics" }),
        scheduledClass: expect.objectContaining({ id: "lesson-1", title: "Algebra lesson" }),
        classGroup: expect.objectContaining({ id: "group-1", name: "IGCSE Mathematics A" }),
        teacher: expect.objectContaining({ id: "teacher-1", fullName: "Jane Teacher" }),
        materials: [
          expect.objectContaining({
            id: "material-1",
            href: "/uploads/materials/lesson-notes.pdf",
          }),
        ],
        currentSubmission: expect.objectContaining({
          id: "submission-1",
          grade: 91,
          feedback: "Clear method. Check final notation.",
          submittedWorkHref: "https://drive.example.com/work-v1",
        }),
        submissionHistory: expect.arrayContaining([
          expect.objectContaining({ id: "submission-1", status: "Graded" }),
          expect.objectContaining({ id: "submission-previous", submittedWorkHref: null }),
        ]),
        grade: 91,
        feedback: "Clear method. Check final notation.",
      }),
    );
  });

  it("marks archived assignment details as read-only and not submittable", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(
      assignmentRow({
        archivedAt: new Date("2026-06-21T10:00:00.000Z"),
        submissions: [],
      }),
    );

    const { getAssignmentDetailForStudent } = await loadRepository();
    const detail = await getAssignmentDetailForStudent("student-1", "assignment-1");

    expect(detail).toEqual(
      expect.objectContaining({
        archivedAt: expect.any(Date),
        canSubmit: false,
        canResubmit: false,
        readOnlyReason: expect.stringMatching(/archived/i),
      }),
    );
  });
});
