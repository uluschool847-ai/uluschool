import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assignment: {
    findFirst: vi.fn(),
  },
  submission: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type SubmissionRepositoryModule = {
  submitOrResubmitStudentWork: (input: Record<string, unknown>) => Promise<unknown>;
  getStudentAssignmentWithSubmission: (studentId: string, assignmentId: string) => Promise<unknown>;
  listSubmissionsForAssignmentByTeacher: (
    teacherId: string,
    assignmentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listSubmissionsForTeacher: (
    teacherId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  getSubmissionForTeacher: (teacherId: string, submissionId: string) => Promise<unknown>;
  gradeSubmissionForTeacher: (
    teacherId: string,
    submissionId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
};

function loadSubmissionRepository() {
  const specifier = "@/lib/repositories/submission-repository";
  return import(/* @vite-ignore */ specifier) as Promise<SubmissionRepositoryModule>;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic homework",
    archivedAt: null,
    teacherId: "teacher-1",
    scheduledClass: {
      id: "lesson-1",
      teacherId: "teacher-1",
      classGroup: {
        id: "group-1",
        teacherId: "teacher-1",
        students: [{ id: "student-1" }],
      },
      students: [{ id: "student-1" }],
    },
    submissions: [],
    ...overrides,
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    studentId: "student-1",
    assignmentId: "assignment-1",
    contentUrl: "https://drive.test/submission-v1",
    grade: null,
    feedback: null,
    submittedAt: new Date("2026-07-10T10:00:00.000Z"),
    assignment: assignment(),
    ...overrides,
  };
}

describe("submission-repository ownership contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the dedicated submission repository API instead of relying on portal-repository", async () => {
    const repository = await loadSubmissionRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        submitOrResubmitStudentWork: expect.any(Function),
        getStudentAssignmentWithSubmission: expect.any(Function),
        listSubmissionsForAssignmentByTeacher: expect.any(Function),
        listSubmissionsForTeacher: expect.any(Function),
        getSubmissionForTeacher: expect.any(Function),
        gradeSubmissionForTeacher: expect.any(Function),
      }),
    );
  });

  it("loads a student assignment only when the session student is enrolled in the scheduled class or class group", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(
      assignment({ submissions: [submission({ studentId: "student-1" })] }),
    );

    const { getStudentAssignmentWithSubmission } = await loadSubmissionRepository();
    const result = await getStudentAssignmentWithSubmission("student-1", "assignment-1");

    expect(prismaMock.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "assignment-1",
          OR: expect.arrayContaining([
            { scheduledClass: { students: { some: { id: "student-1" } } } },
            { scheduledClass: { classGroup: { students: { some: { id: "student-1" } } } } },
          ]),
        }),
        include: expect.objectContaining({
          submissions: expect.objectContaining({
            where: { studentId: "student-1" },
          }),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "assignment-1" }));
  });

  it("submits work only as the session student and ignores submitted studentId spoofing", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(assignment());
    prismaMock.submission.findFirst.mockResolvedValueOnce(null);
    prismaMock.submission.create.mockResolvedValueOnce(submission());

    const { submitOrResubmitStudentWork } = await loadSubmissionRepository();
    await submitOrResubmitStudentWork({
      studentId: "student-1",
      submittedStudentId: "student-2",
      assignmentId: "assignment-1",
      contentUrl: "https://drive.test/submission-v1",
    });

    expect(prismaMock.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "assignment-1",
          archivedAt: null,
          OR: expect.arrayContaining([
            { scheduledClass: { students: { some: { id: "student-1" } } } },
            { scheduledClass: { classGroup: { students: { some: { id: "student-1" } } } } },
          ]),
        }),
      }),
    );
    expect(prismaMock.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          assignmentId: "assignment-1",
          contentUrl: "https://drive.test/submission-v1",
        }),
      }),
    );
    expect(JSON.stringify(prismaMock.submission.create.mock.calls[0][0])).not.toContain(
      "student-2",
    );
  });

  it("rejects submit/resubmit for assignments outside the student's enrolled class context", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(null);

    const { submitOrResubmitStudentWork } = await loadSubmissionRepository();

    await expect(
      submitOrResubmitStudentWork({
        studentId: "student-1",
        assignmentId: "foreign-assignment",
        contentUrl: "https://drive.test/foreign",
      }),
    ).rejects.toThrow(/unauthorized|not enrolled|not found/i);
    expect(prismaMock.submission.create).not.toHaveBeenCalled();
    expect(prismaMock.submission.update).not.toHaveBeenCalled();
  });

  it("rejects submissions to archived assignments", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(null);

    const { submitOrResubmitStudentWork } = await loadSubmissionRepository();

    await expect(
      submitOrResubmitStudentWork({
        studentId: "student-1",
        assignmentId: "archived-assignment",
        contentUrl: "https://drive.test/submission",
      }),
    ).rejects.toThrow(/archived|not found|unauthorized/i);
    expect(prismaMock.submission.create).not.toHaveBeenCalled();
  });

  it("resubmits by updating contentUrl/submittedAt and clearing previous grade feedback", async () => {
    prismaMock.assignment.findFirst.mockResolvedValueOnce(assignment());
    prismaMock.submission.findFirst.mockResolvedValueOnce(
      submission({ grade: 75, feedback: "Needs revision." }),
    );
    prismaMock.submission.update.mockResolvedValueOnce(
      submission({
        contentUrl: "https://drive.test/submission-v2",
        grade: null,
        feedback: null,
      }),
    );

    const { submitOrResubmitStudentWork } = await loadSubmissionRepository();
    await submitOrResubmitStudentWork({
      studentId: "student-1",
      assignmentId: "assignment-1",
      contentUrl: "https://drive.test/submission-v2",
    });

    expect(prismaMock.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "submission-1" },
        data: expect.objectContaining({
          contentUrl: "https://drive.test/submission-v2",
          submittedAt: expect.any(Date),
          grade: null,
          feedback: null,
        }),
      }),
    );
  });

  it("lists, gets, and grades submissions only for teacher-owned assignment scope", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([submission()]);
    prismaMock.submission.findFirst
      .mockResolvedValueOnce(submission())
      .mockResolvedValueOnce(submission());
    prismaMock.submission.update.mockResolvedValueOnce(
      submission({ grade: 92, feedback: "Strong work." }),
    );

    const {
      listSubmissionsForAssignmentByTeacher,
      getSubmissionForTeacher,
      gradeSubmissionForTeacher,
    } = await loadSubmissionRepository();

    await listSubmissionsForAssignmentByTeacher("teacher-1", "assignment-1", {
      status: "pending",
    });
    await getSubmissionForTeacher("teacher-1", "submission-1");
    await gradeSubmissionForTeacher("teacher-1", "submission-1", {
      grade: 92,
      feedback: "Strong work.",
    });

    const ownershipScope = expect.arrayContaining([
      { assignment: { scheduledClass: { teacherId: "teacher-1" } } },
      { assignment: { scheduledClass: { classGroup: { teacherId: "teacher-1" } } } },
    ]);
    expect(prismaMock.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignmentId: "assignment-1",
          grade: null,
          OR: ownershipScope,
        }),
      }),
    );
    expect(prismaMock.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "submission-1",
          OR: ownershipScope,
        }),
      }),
    );
    expect(prismaMock.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "submission-1" },
        data: expect.objectContaining({ grade: 92, feedback: "Strong work." }),
      }),
    );
  });

  it("rejects list/get/grade when the submission belongs to another teacher", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([]);
    prismaMock.submission.findFirst.mockResolvedValue(null);

    const {
      listSubmissionsForAssignmentByTeacher,
      getSubmissionForTeacher,
      gradeSubmissionForTeacher,
    } = await loadSubmissionRepository();

    await expect(
      listSubmissionsForAssignmentByTeacher("teacher-1", "foreign-assignment"),
    ).resolves.toEqual([]);
    await expect(getSubmissionForTeacher("teacher-1", "foreign-submission")).resolves.toBeNull();
    await expect(
      gradeSubmissionForTeacher("teacher-1", "foreign-submission", { grade: 90 }),
    ).rejects.toThrow(/unauthorized|not found|not owned/i);
    expect(prismaMock.submission.update).not.toHaveBeenCalled();
  });

  it("returns a teacher-scoped review detail shape for the submission workspace", async () => {
    prismaMock.submission.findFirst.mockResolvedValueOnce(
      submission({
        attachments: [
          {
            id: "attachment-1",
            filename: "quadratic-work.pdf",
            storageKey: "submissions/quadratic-work.pdf",
          },
        ],
        grade: 87,
        feedback: "Clear factoring.",
        updatedAt: new Date("2026-07-10T11:00:00.000Z"),
        assignment: assignment({
          id: "assignment-1",
          title: "Quadratic homework",
          description: "Solve every quadratic problem.",
          dueDate: new Date("2026-07-12T20:00:00.000Z"),
          scheduledClass: {
            id: "lesson-1",
            title: "Algebra lesson",
            teacherId: "teacher-1",
            subjectId: "subject-1",
            classGroupId: "group-1",
            subject: { id: "subject-1", name: "Algebra", slug: "algebra" },
            classGroup: { id: "group-1", name: "Algebra Group A", teacherId: "teacher-1" },
          },
        }),
        student: {
          id: "student-1",
          fullName: "Amina Yusuf",
          email: "amina@example.com",
        },
      }),
    );

    const { getSubmissionForTeacher } = await loadSubmissionRepository();
    const detail = await getSubmissionForTeacher("teacher-1", "submission-1");

    expect(prismaMock.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "submission-1",
          OR: expect.arrayContaining([
            { assignment: { scheduledClass: { teacherId: "teacher-1" } } },
            { assignment: { scheduledClass: { classGroup: { teacherId: "teacher-1" } } } },
          ]),
        }),
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        id: "submission-1",
        status: "Graded",
        grade: 87,
        feedback: "Clear factoring.",
        submittedWorkHref: "/uploads/submissions/quadratic-work.pdf",
        student: expect.objectContaining({
          fullName: "Amina Yusuf",
          email: "amina@example.com",
        }),
        assignment: expect.objectContaining({
          title: "Quadratic homework",
          description: "Solve every quadratic problem.",
          dueDate: expect.any(Date),
        }),
        scheduledClass: expect.objectContaining({
          id: "lesson-1",
          title: "Algebra lesson",
        }),
        classGroup: expect.objectContaining({
          id: "group-1",
          name: "Algebra Group A",
          href: "/portal/teacher/classes/group-1",
        }),
        subject: expect.objectContaining({ id: "subject-1", name: "Algebra" }),
        attachments: [
          expect.objectContaining({
            id: "attachment-1",
            filename: "quadratic-work.pdf",
            href: "/uploads/submissions/quadratic-work.pdf",
          }),
        ],
      }),
    );
  });

  it.each([
    [{}, /grade|required/i],
    [{ grade: "A" }, /grade|number/i],
    [{ grade: -1 }, /grade|0/i],
    [{ grade: 101 }, /grade|100/i],
  ])("validates grading input %#", async (input, message) => {
    const { gradeSubmissionForTeacher } = await loadSubmissionRepository();

    await expect(gradeSubmissionForTeacher("teacher-1", "submission-1", input)).rejects.toThrow(
      message,
    );
    expect(prismaMock.submission.update).not.toHaveBeenCalled();
  });

  it.each([
    [" Good work ", "Good work"],
    ["", null],
    ["   ", null],
  ])("normalizes optional feedback %# to %#", async (rawFeedback, expectedFeedback) => {
    prismaMock.submission.findFirst.mockResolvedValueOnce(submission());
    prismaMock.submission.update.mockResolvedValueOnce(
      submission({ grade: 91, feedback: expectedFeedback }),
    );

    const { gradeSubmissionForTeacher } = await loadSubmissionRepository();
    await gradeSubmissionForTeacher("teacher-1", "submission-1", {
      grade: 91,
      feedback: rawFeedback,
    });

    expect(prismaMock.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedback: expectedFeedback,
          grade: 91,
        }),
      }),
    );
  });

  it("rejects feedback over 2000 characters without mutating the submission", async () => {
    prismaMock.submission.findFirst.mockResolvedValueOnce(submission({ feedback: "Old feedback" }));

    const { gradeSubmissionForTeacher } = await loadSubmissionRepository();

    await expect(
      gradeSubmissionForTeacher("teacher-1", "submission-1", {
        grade: 91,
        feedback: "x".repeat(2001),
      }),
    ).rejects.toThrow(/feedback|2000/i);
    expect(prismaMock.submission.update).not.toHaveBeenCalled();
  });

  it("returns before and after feedback values for grading audit payloads", async () => {
    prismaMock.submission.findFirst.mockResolvedValueOnce(
      submission({ grade: 80, feedback: "Needs more detail." }),
    );
    prismaMock.submission.update.mockResolvedValueOnce(
      submission({ grade: 92, feedback: "Much clearer now." }),
    );

    const { gradeSubmissionForTeacher } = await loadSubmissionRepository();
    const result = await gradeSubmissionForTeacher("teacher-1", "submission-1", {
      grade: 92,
      feedback: "Much clearer now.",
    });

    expect(result).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ feedback: "Needs more detail.", grade: 80 }),
        after: expect.objectContaining({ feedback: "Much clearer now.", grade: 92 }),
      }),
    );
  });

  it("lists all teacher-visible submissions through scheduled class and class group ownership", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([
      submission({
        student: {
          id: "student-1",
          email: "amina@example.com",
          fullName: "Amina Yusuf",
        },
        assignment: assignment({
          title: "Quadratic homework",
          subject: { id: "subject-1", name: "Algebra" },
          scheduledClass: {
            id: "lesson-1",
            teacherId: "teacher-1",
            subjectId: "subject-1",
            classGroupId: "group-1",
            title: "Algebra Group A",
            classGroup: { id: "group-1", name: "Algebra Group A", teacherId: "teacher-1" },
          },
        }),
      }),
    ]);

    const { listSubmissionsForTeacher } = await loadSubmissionRepository();
    const rows = await listSubmissionsForTeacher("teacher-1", {
      assignmentId: "assignment-1",
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "amina quadratic",
      sort: "studentName",
      status: "pending",
      studentId: "student-1",
      subjectId: "subject-1",
    });

    const query = prismaMock.submission.findMany.mock.calls[0][0];
    const whereText = JSON.stringify(query.where);
    expect(query.where).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { assignment: { scheduledClass: { teacherId: "teacher-1" } } },
          { assignment: { scheduledClass: { classGroup: { teacherId: "teacher-1" } } } },
        ]),
      }),
    );
    expect(whereText).toContain("assignment-1");
    expect(whereText).toContain("group-1");
    expect(whereText).toContain("lesson-1");
    expect(whereText).toContain("student-1");
    expect(whereText).toContain("subject-1");
    expect(whereText).toContain("amina quadratic");
    expect(whereText).toContain("grade");
    expect(query.orderBy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          student: expect.any(Object),
        }),
      ]),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        assignmentTitle: "Quadratic homework",
        classGroup: expect.objectContaining({ id: "group-1", name: "Algebra Group A" }),
        contentUrl: "https://drive.test/submission-v1",
        feedbackPreview: null,
        grade: null,
        reviewHref: expect.stringMatching(/^\/portal\/teacher\/submissions\/submission-1/),
        status: "Pending",
        student: expect.objectContaining({
          email: "amina@example.com",
          fullName: "Amina Yusuf",
        }),
        subject: expect.objectContaining({ id: "subject-1", name: "Algebra" }),
        submissionId: "submission-1",
      }),
    ]);
  });

  it.each([
    ["pending", { grade: null }],
    ["graded", { grade: { not: null } }],
    ["all", {}],
  ])(
    "applies %s status filtering inside the teacher ownership scope",
    async (status, gradeWhere) => {
      prismaMock.submission.findMany.mockResolvedValueOnce([]);

      const { listSubmissionsForTeacher } = await loadSubmissionRepository();
      await listSubmissionsForTeacher("teacher-1", { status });

      const where = prismaMock.submission.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { assignment: { scheduledClass: { teacherId: "teacher-1" } } },
          { assignment: { scheduledClass: { classGroup: { teacherId: "teacher-1" } } } },
        ]),
      );
      expect(where).toEqual(expect.objectContaining(gradeWhere));
    },
  );

  it("treats foreign assignment and student filters as no-match inside the teacher scope", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([]);

    const { listSubmissionsForTeacher } = await loadSubmissionRepository();
    await expect(
      listSubmissionsForTeacher("teacher-1", {
        assignmentId: "foreign-assignment",
        studentId: "foreign-student",
      }),
    ).resolves.toEqual([]);

    const whereText = JSON.stringify(prismaMock.submission.findMany.mock.calls[0][0].where);
    expect(whereText).toContain("foreign-assignment");
    expect(whereText).toContain("foreign-student");
    expect(whereText).toContain("teacher-1");
  });

  it("ignores invalid status and defaults sorting to submittedAt descending", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([]);

    const { listSubmissionsForTeacher } = await loadSubmissionRepository();
    await listSubmissionsForTeacher("teacher-1", {
      sort: "dropTable",
      status: "unknown",
    });

    const query = prismaMock.submission.findMany.mock.calls[0][0];
    expect(JSON.stringify(query.where)).not.toContain("unknown");
    expect(JSON.stringify(query.orderBy)).not.toContain("dropTable");
    expect(query.orderBy).toEqual(expect.arrayContaining([{ submittedAt: "desc" }]));
  });
});
