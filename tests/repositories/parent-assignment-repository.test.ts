import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
}));

const listAssignmentsForStudentMock = vi.hoisted(() => vi.fn());
const getAssignmentDetailForStudentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  getAssignmentDetailForStudent: getAssignmentDetailForStudentMock,
  listAssignmentsForStudent: listAssignmentsForStudentMock,
}));

type ParentAssignmentRepositoryModule = {
  listAssignmentsForParentChild: (
    parentId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  getAssignmentDetailForParentChild: (
    parentId: string,
    studentId: string,
    assignmentId: string,
  ) => Promise<Record<string, unknown> | null>;
};

function loadRepository() {
  const specifier = "@/lib/repositories/parent-assignment-repository";
  return import(/* @vite-ignore */ specifier) as Promise<ParentAssignmentRepositoryModule>;
}

function studentAssignment(overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: null,
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    descriptionPreview: "Solve the quadratic worksheet.",
    detailHref: "/portal/student/assignments/assignment-1",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    feedbackPreview: "Clear method.",
    grade: 91,
    id: "assignment-1",
    scheduledClass: { id: "lesson-1", title: "Algebra lesson" },
    status: "Graded",
    submissionSummary: {
      feedbackPreview: "Clear method.",
      grade: 91,
      submittedAt: new Date("2026-06-19T18:00:00.000Z"),
    },
    subject: { id: "subject-math", name: "Mathematics" },
    title: "Quadratic equations",
    ...overrides,
  };
}

function studentAssignmentDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...studentAssignment(),
    canResubmit: true,
    canSubmit: true,
    currentSubmission: {
      contentUrl: "https://drive.example.com/work-v2",
      feedback: "Strong structure. Improve final notation.",
      grade: 91,
      id: "submission-2",
      submittedAt: new Date("2026-06-19T18:00:00.000Z"),
      submittedWorkHref: "https://drive.example.com/work-v2",
    },
    description: "Solve questions 1-10 from the workbook.",
    feedback: "Strong structure. Improve final notation.",
    grade: 91,
    materials: [{ href: "/uploads/materials/algebra.pdf", id: "material-1", title: "Algebra PDF" }],
    submissionHistory: [
      {
        contentUrl: "https://drive.example.com/work-v2",
        feedback: "Strong structure. Improve final notation.",
        grade: 91,
        id: "submission-2",
        status: "Graded",
        submittedAt: new Date("2026-06-19T18:00:00.000Z"),
        submittedWorkHref: "https://drive.example.com/work-v2",
      },
      {
        contentUrl: "https://drive.example.com/work-v1",
        feedback: null,
        grade: null,
        id: "submission-1",
        status: "Submitted",
        submittedAt: new Date("2026-06-18T18:00:00.000Z"),
        submittedWorkHref: "https://drive.example.com/work-v1",
      },
    ],
    teacher: { email: "teacher@example.com", fullName: "Jane Teacher", id: "teacher-1" },
    ...overrides,
  };
}

describe("parent assignment read repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue({
      children: [{ id: "student-1", fullName: "Sofia Shevchenko" }],
      id: "parent-1",
      role: UserRole.PARENT,
    });
    listAssignmentsForStudentMock.mockResolvedValue([studentAssignment()]);
    getAssignmentDetailForStudentMock.mockResolvedValue(studentAssignmentDetail());
  });

  it("exports the dedicated parent assignment read API", async () => {
    const repository = await loadRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        getAssignmentDetailForParentChild: expect.any(Function),
        listAssignmentsForParentChild: expect.any(Function),
      }),
    );
  });

  it("lists assignments only after verifying the requested child is linked to the parent", async () => {
    const { listAssignmentsForParentChild } = await loadRepository();
    const rows = await listAssignmentsForParentChild("parent-1", "student-1", {
      search: "quadratic",
      status: "graded",
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
    expect(listAssignmentsForStudentMock).toHaveBeenCalledWith("student-1", {
      search: "quadratic",
      status: "graded",
    });
    expect(rows).toEqual([
      expect.objectContaining({
        detailHref: "/portal/parent/assignments/student-1/assignment-1",
        dueDate: new Date("2026-06-20T20:00:00.000Z"),
        feedbackPreview: "Clear method.",
        grade: 91,
        id: "assignment-1",
        scheduledClass: expect.objectContaining({ id: "lesson-1" }),
        status: "Graded",
        subject: expect.objectContaining({ id: "subject-math" }),
        submissionSummary: expect.objectContaining({ grade: 91 }),
        title: "Quadratic equations",
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain("/portal/student/assignments");
  });

  it("preserves assignments reached through direct scheduled-class and classGroup enrollment", async () => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([
      studentAssignment({
        classGroup: null,
        enrollmentSource: "scheduledClass",
        id: "direct-assignment",
        scheduledClass: { id: "direct-lesson", title: "Direct algebra lesson" },
        status: "Not submitted",
        title: "Direct lesson homework",
      }),
      studentAssignment({
        enrollmentSource: "classGroup",
        id: "group-assignment",
        scheduledClass: { id: "group-lesson", title: "Group geometry lesson" },
        status: "Submitted",
        title: "Group lesson homework",
      }),
    ]);

    const { listAssignmentsForParentChild } = await loadRepository();
    const rows = await listAssignmentsForParentChild("parent-1", "student-1", { status: "all" });

    expect(rows).toEqual([
      expect.objectContaining({
        detailHref: "/portal/parent/assignments/student-1/direct-assignment",
        id: "direct-assignment",
        status: "Not submitted",
      }),
      expect.objectContaining({
        classGroup: expect.objectContaining({ id: "group-1" }),
        detailHref: "/portal/parent/assignments/student-1/group-assignment",
        id: "group-assignment",
        status: "Submitted",
      }),
    ]);
  });

  it.each(["active", "submitted", "graded", "missing", "archived", "all"])(
    "forwards %s status without widening the linked-child scope",
    async (status) => {
      const { listAssignmentsForParentChild } = await loadRepository();
      await listAssignmentsForParentChild("parent-1", "student-1", { status });

      expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            children: { some: { id: "student-1" } },
            id: "parent-1",
          }),
        }),
      );
      expect(listAssignmentsForStudentMock).toHaveBeenCalledWith("student-1", { status });
    },
  );

  it("forwards subject, group, class, search, due date, and sort filters after parent-child verification", async () => {
    const filters = {
      classGroupId: "group-1",
      dueFrom: "2026-06-01",
      dueTo: "2026-06-30",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "dueDateAsc",
      status: "active",
      subjectId: "subject-math",
    };

    const { listAssignmentsForParentChild } = await loadRepository();
    await listAssignmentsForParentChild("parent-1", "student-1", filters);

    expect(listAssignmentsForStudentMock).toHaveBeenCalledWith("student-1", filters);
    expect(JSON.stringify(prismaMock.appUser.findFirst.mock.calls)).not.toContain(
      "foreign-student",
    );
  });

  it.each(["dueDateAsc", "dueDateDesc", "title", "status"])(
    "supports %s sorting through the parent read API",
    async (sort) => {
      const { listAssignmentsForParentChild } = await loadRepository();
      await listAssignmentsForParentChild("parent-1", "student-1", { sort });

      expect(listAssignmentsForStudentMock).toHaveBeenCalledWith("student-1", { sort });
    },
  );

  it("keeps missing overdue assignments on the existing Missing status", async () => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([
      studentAssignment({
        dueDate: new Date("2020-01-01T20:00:00.000Z"),
        feedbackPreview: null,
        grade: null,
        id: "missing-assignment",
        status: "Missing",
        submissionSummary: null,
        title: "Late algebra homework",
      }),
    ]);

    const { listAssignmentsForParentChild } = await loadRepository();
    const rows = await listAssignmentsForParentChild("parent-1", "student-1", {
      status: "missing",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "missing-assignment",
        status: "Missing",
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/overdue/i);
  });

  it("returns an empty list and does not delegate to student reads for an unlinked child", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { listAssignmentsForParentChild } = await loadRepository();
    const rows = await listAssignmentsForParentChild("parent-1", "unlinked-student", {
      status: "all",
    });

    expect(rows).toEqual([]);
    expect(listAssignmentsForStudentMock).not.toHaveBeenCalled();
  });

  it("returns parent-scoped assignment detail with submission history, grade, and feedback", async () => {
    const { getAssignmentDetailForParentChild } = await loadRepository();
    const detail = await getAssignmentDetailForParentChild("parent-1", "student-1", "assignment-1");

    expect(getAssignmentDetailForStudentMock).toHaveBeenCalledWith("student-1", "assignment-1");
    expect(detail).toEqual(
      expect.objectContaining({
        backHref: "/portal/parent/assignments/student-1",
        canResubmit: false,
        canSubmit: false,
        currentSubmission: expect.objectContaining({
          feedback: "Strong structure. Improve final notation.",
          grade: 91,
          submittedWorkHref: "https://drive.example.com/work-v2",
        }),
        detailHref: "/portal/parent/assignments/student-1/assignment-1",
        feedback: "Strong structure. Improve final notation.",
        grade: 91,
        materials: expect.arrayContaining([
          expect.objectContaining({ href: "/uploads/materials/algebra.pdf" }),
        ]),
        readOnlyReason: expect.stringMatching(/parent|read-only|view/i),
        scheduledClass: expect.objectContaining({ id: "lesson-1" }),
        submissionHistory: expect.arrayContaining([
          expect.objectContaining({ id: "submission-2", status: "Graded" }),
          expect.objectContaining({ id: "submission-1", status: "Submitted" }),
        ]),
        teacher: expect.objectContaining({ fullName: "Jane Teacher" }),
      }),
    );
    expect(JSON.stringify(detail)).not.toMatch(/canSubmit":true|canResubmit":true/);
  });

  it("marks archived details as read-only for parents", async () => {
    getAssignmentDetailForStudentMock.mockResolvedValueOnce(
      studentAssignmentDetail({
        archivedAt: new Date("2026-06-21T10:00:00.000Z"),
        canResubmit: false,
        canSubmit: false,
        readOnlyReason: "This assignment is archived.",
        status: "Archived",
      }),
    );

    const { getAssignmentDetailForParentChild } = await loadRepository();
    const detail = await getAssignmentDetailForParentChild("parent-1", "student-1", "assignment-1");

    expect(detail).toEqual(
      expect.objectContaining({
        archivedAt: expect.any(Date),
        canResubmit: false,
        canSubmit: false,
        readOnlyReason: expect.stringMatching(/archived|read-only/i),
        status: "Archived",
      }),
    );
  });

  it("returns null for missing, foreign, or unlinked assignment details", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { getAssignmentDetailForParentChild } = await loadRepository();
    await expect(
      getAssignmentDetailForParentChild("parent-1", "unlinked-student", "foreign-assignment"),
    ).resolves.toBeNull();
    expect(getAssignmentDetailForStudentMock).not.toHaveBeenCalled();

    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      children: [{ id: "student-1" }],
      id: "parent-1",
      role: UserRole.PARENT,
    });
    getAssignmentDetailForStudentMock.mockResolvedValueOnce(null);

    await expect(
      getAssignmentDetailForParentChild("parent-1", "student-1", "missing-assignment"),
    ).resolves.toBeNull();
  });
});
