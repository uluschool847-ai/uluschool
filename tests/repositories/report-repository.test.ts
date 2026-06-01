import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  academicTerm: { findMany: vi.fn() },
  appUser: { findFirst: vi.fn(), findMany: vi.fn() },
  classGroup: { findMany: vi.fn() },
  reportSnapshot: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));
const getTeacherStudentGradebookMock = vi.hoisted(() => vi.fn());
const listAttendanceHistoryForStudentMock = vi.hoisted(() => vi.fn());
const listProgressNotesForTeacherStudentMock = vi.hoisted(() => vi.fn());
const renderReportSnapshotPdfMock = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());
const getURLMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getTeacherStudentGradebook: getTeacherStudentGradebookMock,
}));
vi.mock("@/lib/repositories/attendance-repository", () => ({
  listAttendanceHistoryForStudent: listAttendanceHistoryForStudentMock,
}));
vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listProgressNotesForTeacherStudent: listProgressNotesForTeacherStudentMock,
}));
vi.mock("@/lib/services/report-pdf", () => ({
  renderReportSnapshotPdf: renderReportSnapshotPdfMock,
}));
vi.mock("@/lib/storage", () => ({
  createStorageService: () => ({
    getURL: getURLMock,
    upload: uploadMock,
  }),
}));

type ReportRepositoryModule = {
  buildReportPreview: (teacherId: string, studentId: string, termId: string) => Promise<unknown>;
  getTeacherReportOptions: (teacherId: string) => Promise<unknown>;
  saveReportSnapshot: (teacherId: string, input: Record<string, unknown>) => Promise<unknown>;
  listReportSnapshotsForStudent: (
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listReportSnapshotsForParentChild: (
    parentId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  getReportSnapshotForTeacher: (teacherId: string, snapshotId: string) => Promise<unknown>;
  getReportSnapshotForStudent: (studentId: string, snapshotId: string) => Promise<unknown>;
  getReportSnapshotForParent: (
    parentId: string,
    studentId: string,
    snapshotId: string,
  ) => Promise<unknown>;
  exportReportSnapshotPdf: (teacherId: string, snapshotId: string) => Promise<unknown>;
};

function loadReportRepository() {
  const specifier = "@/lib/repositories/report-repository";
  return import(/* @vite-ignore */ specifier) as Promise<ReportRepositoryModule>;
}

function gradebook(overrides: Record<string, unknown> = {}) {
  return {
    student: { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
    term: { id: "term-1", name: "Spring 2026" },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    categories: [{ label: "Homework", average: 90 }],
    termAverage: 90,
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "snapshot-1",
    studentId: "student-1",
    classGroupId: "group-1",
    academicTermId: "term-1",
    generatedByTeacherId: "teacher-1",
    generatedAt: new Date("2026-05-20T10:00:00.000Z"),
    snapshotVersion: 1,
    snapshotData: {
      student: { id: "student-1", fullName: "Amina Yusuf" },
      academicTerm: {
        id: "term-1",
        name: "Spring 2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-06-30T23:59:59.999Z",
      },
      classGroup: { id: "group-1", name: "Algebra Group A" },
      grades: {
        categories: [{ label: "Homework", average: 90 }],
        homeworkGrades: [{ title: "Quadratics homework", score: 92 }],
        manualGrades: [{ title: "Oral checkpoint", score: 88 }],
        weightedTermAverage: 90,
      },
      attendance: { present: 8, late: 1, absent: 1 },
      attendanceHistory: [{ lessonTitle: "Algebra review", status: "PRESENT" }],
      progressNotes: [{ content: "Strong progress", performanceLevel: "GOOD" }],
      teacherComment: "Keep practicing",
    },
    pdfGeneratedAt: new Date("2026-05-21T10:00:00.000Z"),
    pdfStorageKey: "reports/snapshot-1.pdf",
    createdAt: new Date("2026-05-20T10:01:00.000Z"),
    updatedAt: new Date("2026-05-20T10:01:00.000Z"),
    ...overrides,
  };
}

describe("report-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue({
      id: "student-1",
      fullName: "Amina Yusuf",
      email: "amina@example.com",
    });
    prismaMock.appUser.findMany.mockResolvedValue([
      { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
    ]);
    prismaMock.academicTerm.findMany.mockResolvedValue([
      {
        id: "term-1",
        name: "Spring 2026",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-06-30T23:59:59.999Z"),
      },
    ]);
    prismaMock.classGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        name: "Algebra Group A",
        subject: { name: "Mathematics" },
        students: [{ id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" }],
      },
    ]);
    prismaMock.reportSnapshot.create.mockResolvedValue(snapshot());
    prismaMock.reportSnapshot.findFirst.mockResolvedValue(snapshot());
    prismaMock.reportSnapshot.update.mockResolvedValue(
      snapshot({
        pdfGeneratedAt: new Date("2026-05-21T11:00:00.000Z"),
        pdfStorageKey: "uploads/amina-yusuf-spring-2026.pdf",
      }),
    );
    getTeacherStudentGradebookMock.mockResolvedValue(gradebook());
    listAttendanceHistoryForStudentMock.mockResolvedValue([
      { status: "PRESENT" },
      { status: "LATE", lateMinutes: 7 },
      { status: "ABSENT" },
    ]);
    listProgressNotesForTeacherStudentMock.mockResolvedValue([
      { id: "progress-1", content: "Strong progress", performanceLevel: "GOOD" },
    ]);
    renderReportSnapshotPdfMock.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      contentType: "application/pdf",
      filename: "amina-yusuf-spring-2026.pdf",
    });
    uploadMock.mockResolvedValue("uploads/amina-yusuf-spring-2026.pdf");
    getURLMock.mockReturnValue("/uploads/amina-yusuf-spring-2026.pdf");
  });

  it("exports the report repository API", async () => {
    const repository = await loadReportRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        buildReportPreview: expect.any(Function),
        getTeacherReportOptions: expect.any(Function),
        saveReportSnapshot: expect.any(Function),
        listReportSnapshotsForStudent: expect.any(Function),
        getReportSnapshotForTeacher: expect.any(Function),
        getReportSnapshotForStudent: expect.any(Function),
        getReportSnapshotForParent: expect.any(Function),
        listReportSnapshotsForParentChild: expect.any(Function),
        exportReportSnapshotPdf: expect.any(Function),
      }),
    );
  });

  it("builds preview from live gradebook, attendance, and progress for teacher-owned student", async () => {
    const { buildReportPreview } = await loadReportRepository();
    const preview = await buildReportPreview("teacher-1", "student-1", "term-1");

    expect(getTeacherStudentGradebookMock).toHaveBeenCalledWith("teacher-1", "student-1", "term-1");
    expect(listAttendanceHistoryForStudentMock).toHaveBeenCalledWith(
      { type: "teacher", teacherId: "teacher-1" },
      "student-1",
      expect.objectContaining({ termId: "term-1" }),
    );
    expect(listProgressNotesForTeacherStudentMock).toHaveBeenCalledWith("teacher-1", "student-1", {
      status: "active",
      termId: "term-1",
    });
    expect(preview).toEqual(
      expect.objectContaining({
        student: expect.objectContaining({ id: "student-1" }),
        academicTerm: expect.objectContaining({ id: "term-1" }),
        grades: expect.objectContaining({ weightedTermAverage: 90 }),
        attendance: expect.any(Object),
        progressNotes: expect.any(Array),
        generatedByTeacherId: "teacher-1",
        generatedAt: expect.any(Date),
        snapshotVersion: 1,
      }),
    );
  });

  it("rejects preview for foreign students when gradebook ownership returns null", async () => {
    getTeacherStudentGradebookMock.mockResolvedValueOnce(null);
    const { buildReportPreview } = await loadReportRepository();

    await expect(buildReportPreview("teacher-2", "student-1", "term-1")).resolves.toBeNull();
    expect(listAttendanceHistoryForStudentMock).not.toHaveBeenCalled();
    expect(listProgressNotesForTeacherStudentMock).not.toHaveBeenCalled();
  });

  it("saves an immutable snapshot with exact preview data", async () => {
    const { saveReportSnapshot } = await loadReportRepository();
    const previewData = {
      student: { id: "student-1", fullName: "Amina Yusuf" },
      classGroup: { id: "group-1", name: "Algebra Group A" },
      academicTerm: { id: "term-1", name: "Spring 2026" },
      grades: { weightedTermAverage: 90 },
      attendance: { present: 8 },
      progressNotes: [],
      teacherComment: "Keep practicing",
      generatedByTeacherId: "teacher-1",
      generatedAt: new Date("2026-05-20T10:00:00.000Z"),
      snapshotVersion: 1,
    };

    await saveReportSnapshot("teacher-1", {
      academicTermId: "term-1",
      classGroupId: "group-1",
      snapshotData: previewData,
      studentId: "student-1",
      teacherComment: "Keep practicing",
    });

    expect(prismaMock.reportSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          academicTermId: "term-1",
          classGroupId: "group-1",
          generatedByTeacherId: "teacher-1",
          snapshotData: previewData,
          snapshotVersion: 1,
          studentId: "student-1",
          teacherComment: "Keep practicing",
        }),
      }),
    );
  });

  it("scopes report preview options through direct lessons and class group enrollments", async () => {
    const { getTeacherReportOptions } = await loadReportRepository();

    const options = await getTeacherReportOptions("teacher-1");

    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { enrolledClasses: { some: { teacherId: "teacher-1" } } },
            { enrolledClassGroups: { some: { teacherId: "teacher-1" } } },
          ],
        },
      }),
    );
    expect(options).toEqual(
      expect.objectContaining({
        students: [expect.objectContaining({ id: "student-1" })],
      }),
    );
  });

  it("returns saved snapshot data unchanged after later live data changes", async () => {
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce(
      snapshot({ snapshotData: { grades: { weightedTermAverage: 90 } } }),
    );
    getTeacherStudentGradebookMock.mockResolvedValueOnce(gradebook({ termAverage: 40 }));

    const { getReportSnapshotForTeacher } = await loadReportRepository();
    const saved = await getReportSnapshotForTeacher("teacher-1", "snapshot-1");

    expect(saved).toEqual(
      expect.objectContaining({
        snapshotData: { grades: { weightedTermAverage: 90 } },
      }),
    );
    expect(getTeacherStudentGradebookMock).not.toHaveBeenCalled();
  });

  it("scopes snapshot reads for teacher, student, linked parent, and unlinked parent", async () => {
    const { getReportSnapshotForParent, getReportSnapshotForStudent, getReportSnapshotForTeacher } =
      await loadReportRepository();

    await getReportSnapshotForTeacher("teacher-1", "snapshot-1");
    await getReportSnapshotForStudent("student-1", "snapshot-1");
    await getReportSnapshotForParent("parent-1", "student-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "snapshot-1", generatedByTeacherId: "teacher-1" }),
      }),
    );
    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "snapshot-1", studentId: "student-1" }),
      }),
    );
    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "parent-1",
          role: "PARENT",
          children: { some: { id: "student-1" } },
        }),
      }),
    );
  });

  it("lists parent child report snapshots with ownership, filters, sorting, and UI-ready rows", async () => {
    prismaMock.reportSnapshot.findMany.mockResolvedValueOnce([
      snapshot(),
      snapshot({
        id: "older-snapshot",
        generatedAt: new Date("2026-04-20T10:00:00.000Z"),
        snapshotData: {
          student: { id: "student-1", fullName: "Amina Yusuf" },
          academicTerm: { id: "term-1", name: "Spring 2026" },
          classGroup: { id: "group-1", name: "Algebra Group A" },
          grades: { weightedTermAverage: 88 },
          teacherComment: "Older report",
        },
      }),
      snapshot({
        id: "foreign-snapshot",
        studentId: "student-2",
        snapshotData: {
          student: { id: "student-2", fullName: "Foreign Student" },
          academicTerm: { id: "term-1", name: "Spring 2026" },
          classGroup: { id: "group-1", name: "Algebra Group A" },
          grades: { weightedTermAverage: 100 },
          teacherComment: "Hidden parent report",
        },
      }),
    ]);

    const { listReportSnapshotsForParentChild } = await loadReportRepository();
    const result = await listReportSnapshotsForParentChild("parent-1", "student-1", {
      classGroupId: "group-1",
      search: "practice",
      sort: "generatedAtAsc",
      termId: "term-1",
    });

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "parent-1",
          role: "PARENT",
          children: { some: { id: "student-1" } },
        }),
      }),
    );
    expect(prismaMock.reportSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.anything(),
        where: expect.objectContaining({
          academicTermId: "term-1",
          classGroupId: "group-1",
          studentId: "student-1",
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        academicTermName: "Spring 2026",
        childName: "Amina Yusuf",
        classGroupName: "Algebra Group A",
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/parent/reports/student-1/snapshot-1",
        id: "snapshot-1",
        pdfAvailable: true,
        teacherCommentPreview: "Keep practicing",
        weightedTermAverage: 90,
      }),
    ]);
  });

  it("returns no parent report rows for unlinked children", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { listReportSnapshotsForParentChild } = await loadReportRepository();
    const result = await listReportSnapshotsForParentChild("parent-1", "foreign-student", {
      termId: "term-1",
    });

    expect(result).toEqual([]);
    expect(prismaMock.reportSnapshot.findMany).not.toHaveBeenCalled();
  });

  it("returns null for parent report detail when the child is unlinked", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { getReportSnapshotForParent } = await loadReportRepository();
    const result = await getReportSnapshotForParent(
      "parent-1",
      "foreign-student",
      "foreign-snapshot",
    );

    expect(result).toBeNull();
    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          children: { some: { id: "foreign-student" } },
          id: "parent-1",
          role: "PARENT",
        }),
      }),
    );
    expect(prismaMock.reportSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it("lists student report snapshots with filters, sorting, PDF metadata, and UI-ready rows", async () => {
    prismaMock.reportSnapshot.findMany.mockResolvedValueOnce([
      snapshot(),
      snapshot({
        id: "foreign-snapshot",
        studentId: "student-2",
        snapshotData: {
          student: { id: "student-2", fullName: "Foreign Student" },
          academicTerm: { id: "term-1", name: "Spring 2026" },
          classGroup: { id: "group-1", name: "Algebra Group A" },
          grades: { weightedTermAverage: 100 },
          teacherComment: "Hidden comment",
        },
      }),
    ]);

    const { listReportSnapshotsForStudent } = await loadReportRepository();
    const result = await listReportSnapshotsForStudent("student-1", {
      classGroupId: "group-1",
      search: "practice",
      sort: "average",
      termId: "term-1",
    });

    expect(prismaMock.reportSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.anything(),
        where: expect.objectContaining({
          academicTermId: "term-1",
          classGroupId: "group-1",
          studentId: "student-1",
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        academicTerm: { id: "term-1", name: "Spring 2026" },
        classGroup: { id: "group-1", name: "Algebra Group A" },
        generatedAt: expect.any(Date),
        href: "/portal/student/reports/snapshot-1",
        id: "snapshot-1",
        pdfAvailable: true,
        pdfGeneratedAt: expect.any(Date),
        teacherCommentPreview: "Keep practicing",
        weightedTermAverage: 90,
      }),
    ]);
  });

  it("returns null for foreign or missing student report snapshots", async () => {
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce(null);

    const { getReportSnapshotForStudent } = await loadReportRepository();
    const result = await getReportSnapshotForStudent("student-1", "foreign-snapshot");

    expect(result).toBeNull();
    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "foreign-snapshot", studentId: "student-1" },
      }),
    );
  });

  it("returns immutable student report detail data with grades attendance progress and PDF metadata", async () => {
    const { getReportSnapshotForStudent } = await loadReportRepository();
    const result = await getReportSnapshotForStudent("student-1", "snapshot-1");

    expect(result).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(Date),
        id: "snapshot-1",
        pdfGeneratedAt: expect.any(Date),
        pdfStorageKey: "reports/snapshot-1.pdf",
        snapshotData: expect.objectContaining({
          attendance: { absent: 1, late: 1, present: 8 },
          attendanceHistory: [expect.objectContaining({ lessonTitle: "Algebra review" })],
          classGroup: { id: "group-1", name: "Algebra Group A" },
          grades: expect.objectContaining({
            homeworkGrades: [expect.objectContaining({ title: "Quadratics homework" })],
            manualGrades: [expect.objectContaining({ title: "Oral checkpoint" })],
            weightedTermAverage: 90,
          }),
          progressNotes: [expect.objectContaining({ content: "Strong progress" })],
          teacherComment: "Keep practicing",
        }),
      }),
    );
  });

  it("exports PDF from saved snapshot data without querying live gradebook or attendance", async () => {
    const { exportReportSnapshotPdf } = await loadReportRepository();
    const result = await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "snapshot-1", generatedByTeacherId: "teacher-1" }),
      }),
    );
    expect(renderReportSnapshotPdfMock).toHaveBeenCalledWith(snapshot().snapshotData);
    expect(uploadMock).toHaveBeenCalledWith(expect.any(Buffer), "amina-yusuf-spring-2026.pdf");
    expect(prismaMock.reportSnapshot.update).toHaveBeenCalledWith({
      where: { id: "snapshot-1" },
      data: {
        pdfGeneratedAt: expect.any(Date),
        pdfStorageKey: "uploads/amina-yusuf-spring-2026.pdf",
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        publicUrl: "/uploads/amina-yusuf-spring-2026.pdf",
        storageKey: "uploads/amina-yusuf-spring-2026.pdf",
      }),
    );
    expect(getTeacherStudentGradebookMock).not.toHaveBeenCalled();
    expect(listAttendanceHistoryForStudentMock).not.toHaveBeenCalled();
  });
});
