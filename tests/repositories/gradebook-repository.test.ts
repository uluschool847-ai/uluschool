import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  academicTerm: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  appUser: {
    findFirst: vi.fn(),
  },
  classGroup: {
    findFirst: vi.fn(),
  },
  manualGradeEntry: {
    findMany: vi.fn(),
  },
  submission: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type GradebookRepositoryModule = {
  listAcademicTerms: (filters?: Record<string, unknown>) => Promise<unknown[]>;
  getTeacherClassGroupGradebook: (
    teacherId: string,
    classGroupId: string,
    termId: string,
  ) => Promise<unknown>;
  getTeacherStudentGradebook: (
    teacherId: string,
    studentId: string,
    termId: string,
  ) => Promise<unknown>;
  getStudentGradebook: (studentId: string, termId: string) => Promise<unknown>;
  getParentChildGradebook: (
    parentId: string,
    studentId: string,
    termId: string,
  ) => Promise<unknown>;
  calculateWeightedTermAverage: (input: Record<string, unknown>) => unknown;
};

type StudentGradebookResult = {
  categories: unknown[];
  homeworkGrades: unknown[];
  manualGradeHistory: unknown[];
  manualGrades: unknown[];
} & Record<string, unknown>;

function loadGradebookRepository() {
  const specifier = "@/lib/repositories/gradebook-repository";
  return import(/* @vite-ignore */ specifier) as Promise<GradebookRepositoryModule>;
}

function term(overrides: Record<string, unknown> = {}) {
  return {
    id: "term-1",
    name: "Spring 2026",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-06-30T23:59:59.999Z"),
    isActive: true,
    ...overrides,
  };
}

function classGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Algebra Group A",
    teacherId: "teacher-1",
    students: [
      { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
      { id: "student-2", fullName: "Mark Chen", email: "mark@example.com" },
    ],
    subject: { id: "subject-1", name: "Algebra" },
    ...overrides,
  };
}

function homeworkSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    grade: 80,
    submittedAt: new Date("2026-03-10T10:00:00.000Z"),
    student: { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
    assignment: {
      id: "assignment-1",
      title: "Quadratics homework",
      subjectId: "subject-1",
      scheduledClass: {
        id: "lesson-1",
        teacherId: "teacher-1",
        classGroupId: "group-1",
        classGroup: { id: "group-1", teacherId: "teacher-1", name: "Algebra Group A" },
      },
    },
    ...overrides,
  };
}

function manualGrade(overrides: Record<string, unknown> = {}) {
  return {
    id: "manual-1",
    title: "Oral checkpoint",
    score: 90,
    archivedAt: null,
    gradedAt: new Date("2026-03-12T10:00:00.000Z"),
    teacherId: "teacher-1",
    student: { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
    subject: { id: "subject-1", name: "Algebra" },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    academicTermId: "term-1",
    ...overrides,
  };
}

describe("gradebook-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.academicTerm.findFirst.mockResolvedValue(term());
    prismaMock.classGroup.findFirst.mockResolvedValue(classGroup());
    prismaMock.submission.findMany.mockResolvedValue([homeworkSubmission()]);
    prismaMock.manualGradeEntry.findMany.mockResolvedValue([manualGrade()]);
  });

  it("exports the gradebook repository API", async () => {
    const repository = await loadGradebookRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        listAcademicTerms: expect.any(Function),
        getTeacherClassGroupGradebook: expect.any(Function),
        getTeacherStudentGradebook: expect.any(Function),
        getStudentGradebook: expect.any(Function),
        getParentChildGradebook: expect.any(Function),
        calculateWeightedTermAverage: expect.any(Function),
      }),
    );
  });

  it("lists academic terms with active-first ordering", async () => {
    prismaMock.academicTerm.findMany.mockResolvedValue([term()]);

    const { listAcademicTerms } = await loadGradebookRepository();
    await listAcademicTerms({ activeOnly: true });

    expect(prismaMock.academicTerm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([{ isActive: "desc" }, { startDate: "desc" }]),
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it("scopes class group gradebook to ClassGroup.teacherId and includes homework and manual grades", async () => {
    const { getTeacherClassGroupGradebook } = await loadGradebookRepository();
    const result = await getTeacherClassGroupGradebook("teacher-1", "group-1", "term-1");

    expect(prismaMock.classGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1", teacherId: "teacher-1" },
      }),
    );
    expect(prismaMock.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          grade: { not: null },
          assignment: expect.objectContaining({
            scheduledClass: expect.objectContaining({
              classGroupId: "group-1",
              classGroup: { teacherId: "teacher-1" },
            }),
          }),
        }),
      }),
    );
    expect(prismaMock.manualGradeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          classGroupId: "group-1",
          teacherId: "teacher-1",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
      }),
    );
  });

  it("returns null for a foreign teacher class group", async () => {
    prismaMock.classGroup.findFirst.mockResolvedValueOnce(null);

    const { getTeacherClassGroupGradebook } = await loadGradebookRepository();
    const result = await getTeacherClassGroupGradebook("teacher-2", "group-1", "term-1");

    expect(result).toBeNull();
    expect(prismaMock.submission.findMany).not.toHaveBeenCalled();
    expect(prismaMock.manualGradeEntry.findMany).not.toHaveBeenCalled();
  });

  it("scopes teacher student gradebook through direct lessons or class group ownership", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
      fullName: "Amina Yusuf",
      email: "amina@example.com",
    });

    const { getTeacherStudentGradebook } = await loadGradebookRepository();
    await getTeacherStudentGradebook("teacher-1", "student-1", "term-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "student-1",
          role: UserRole.STUDENT,
          OR: expect.arrayContaining([
            { enrolledClasses: { some: { teacherId: "teacher-1" } } },
            { classGroups: { some: { teacherId: "teacher-1" } } },
          ]),
        }),
      }),
    );
  });

  it("lets students and linked parents see only scoped gradebooks", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "student-1", role: UserRole.STUDENT });
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "parent-1",
      role: UserRole.PARENT,
      children: [{ id: "student-1" }],
    });

    const { getStudentGradebook, getParentChildGradebook } = await loadGradebookRepository();
    await getStudentGradebook("student-1", "term-1");
    await getParentChildGradebook("parent-1", "student-1", "term-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "student-1", role: UserRole.STUDENT } }),
    );
    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "parent-1",
          role: UserRole.PARENT,
          children: { some: { id: "student-1" } },
        }),
      }),
    );
  });

  it("uses the active academic term by default and returns the student gradebook UI contract", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
      fullName: "Amina Yusuf",
      email: "amina@example.com",
    });
    prismaMock.submission.findMany.mockResolvedValueOnce([
      homeworkSubmission({
        feedback: "Clear method and correct final answer.",
        grade: 82,
      }),
    ]);
    prismaMock.manualGradeEntry.findMany.mockResolvedValueOnce([
      manualGrade({
        description: "Excellent oral explanation.",
        score: 91,
      }),
    ]);
    prismaMock.manualGradeEntry.findMany.mockResolvedValueOnce([
      manualGrade({
        archivedAt: new Date("2026-04-01T00:00:00.000Z"),
        id: "manual-archived",
        score: 50,
        title: "Archived oral checkpoint",
      }),
    ]);

    const { getStudentGradebook } = await loadGradebookRepository();
    const result = await (
      getStudentGradebook as (studentId: string, termId?: string) => Promise<StudentGradebookResult>
    )("student-1");

    expect(prismaMock.academicTerm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { startDate: "desc" },
        where: { isActive: true },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
        student: {
          email: "amina@example.com",
          fullName: "Amina Yusuf",
          id: "student-1",
        },
        term: expect.objectContaining({
          endDate: expect.any(Date),
          id: "term-1",
          name: "Spring 2026",
          startDate: expect.any(Date),
        }),
        termAverage: 84.7,
      }),
    );
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ average: 82, category: "HOMEWORK", label: "Homework" }),
        expect.objectContaining({ average: 91, category: "MANUAL", label: "Manual" }),
      ]),
    );
    expect(result.homeworkGrades).toEqual([
      expect.objectContaining({
        category: "HOMEWORK",
        feedback: "Clear method and correct final answer.",
        score: 82,
        subject: { id: "subject-1", name: "Algebra" },
        submittedAt: expect.any(Date),
        title: "Quadratics homework",
      }),
    ]);
    expect(result.manualGrades).toEqual([
      expect.objectContaining({
        category: "MANUAL",
        description: "Excellent oral explanation.",
        score: 91,
        subject: { id: "subject-1", name: "Algebra" },
        title: "Oral checkpoint",
      }),
    ]);
    expect(result.manualGradeHistory).toEqual([
      expect.objectContaining({ id: "manual-archived", title: "Archived oral checkpoint" }),
    ]);
  });

  it("keeps student gradebook rows scoped to the requested student", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
      fullName: "Amina Yusuf",
      email: "amina@example.com",
    });
    prismaMock.submission.findMany.mockResolvedValueOnce([
      homeworkSubmission(),
      homeworkSubmission({
        id: "foreign-submission",
        grade: 100,
        student: { id: "student-2", fullName: "Mark Chen", email: "mark@example.com" },
        assignment: {
          id: "foreign-assignment",
          title: "Foreign homework",
          subjectId: "subject-1",
          scheduledClass: {
            id: "foreign-lesson",
            teacherId: "teacher-1",
            classGroupId: "group-1",
            classGroup: { id: "group-1", teacherId: "teacher-1", name: "Algebra Group A" },
          },
        },
      }),
    ]);
    prismaMock.manualGradeEntry.findMany.mockResolvedValueOnce([
      manualGrade(),
      manualGrade({
        id: "foreign-manual",
        score: 100,
        student: { id: "student-2", fullName: "Mark Chen", email: "mark@example.com" },
        title: "Foreign oral checkpoint",
      }),
    ]);

    const { getStudentGradebook } = await loadGradebookRepository();
    const result = (await getStudentGradebook("student-1", "term-1")) as StudentGradebookResult;

    expect(prismaMock.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ grade: { not: null }, studentId: "student-1" }),
      }),
    );
    expect(prismaMock.manualGradeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicTermId: "term-1",
          archivedAt: null,
          studentId: "student-1",
        }),
      }),
    );
    expect(result.homeworkGrades).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Foreign homework" })]),
    );
    expect(result.manualGrades).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Foreign oral checkpoint" })]),
    );
  });

  it("calculates weighted averages with default weights and omits empty categories", async () => {
    const { calculateWeightedTermAverage } = await loadGradebookRepository();

    expect(
      calculateWeightedTermAverage({
        categoryAverages: { HOMEWORK: 80, MANUAL: 90 },
        weights: { HOMEWORK: 70, MANUAL: 30 },
      }),
    ).toEqual(83);
    expect(
      calculateWeightedTermAverage({
        categoryAverages: { HOMEWORK: 80, MANUAL: null },
        weights: { HOMEWORK: 70, MANUAL: 30 },
      }),
    ).toEqual(80);
    expect(
      calculateWeightedTermAverage({
        categoryAverages: { HOMEWORK: null, MANUAL: null },
        weights: { HOMEWORK: 70, MANUAL: 30 },
      }),
    ).toBeNull();
  });

  it("keeps archived manual grades out of active averages while exposing history", async () => {
    prismaMock.manualGradeEntry.findMany.mockResolvedValueOnce([
      manualGrade({ id: "manual-active", score: 90 }),
    ]);
    prismaMock.manualGradeEntry.findMany.mockResolvedValueOnce([
      manualGrade({ id: "manual-archived", score: 50, archivedAt: new Date("2026-04-01") }),
    ]);

    const { getTeacherStudentGradebook } = await loadGradebookRepository();
    const result = await getTeacherStudentGradebook("teacher-1", "student-1", "term-1");

    expect(prismaMock.manualGradeEntry.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null }),
      }),
    );
    expect(prismaMock.manualGradeEntry.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: { not: null } }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        manualGradeHistory: expect.arrayContaining([
          expect.objectContaining({ id: "manual-archived" }),
        ]),
      }),
    );
  });
});
