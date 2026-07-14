import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { R2StorageService } from "@/lib/storage/R2StorageService";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const OLD_REPORT_KEY =
  "private/teachers/teacher-1/reports/00000000-0000-4000-8000-000000000001-old-report.pdf";
const NEW_REPORT_KEY =
  "private/teachers/teacher-1/reports/00000000-0000-4000-8000-000000000002-report.pdf";
const LEGACY_REPORT_KEY = "uploads/reports/old-report.pdf";
const LEGACY_REPORT_ALIASES = [
  LEGACY_REPORT_KEY,
  `/${LEGACY_REPORT_KEY}`,
  `public/${LEGACY_REPORT_KEY}`,
  `/public/${LEGACY_REPORT_KEY}`,
  "reports/old-report.pdf",
];
const R2_TEST_CONFIG = {
  endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  bucket: "ulu-school-private",
  accessKeyId: "r2-access-key-value",
  secretAccessKey: "r2-secret-key-value",
};

type StorageReferences = Partial<
  Record<"attachment" | "courseMaterial" | "reportSnapshot" | "submission" | "teacher", string[]>
>;

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  academicTerm: { findMany: vi.fn() },
  appUser: { findFirst: vi.fn(), findMany: vi.fn() },
  attachment: { findFirst: vi.fn() },
  classGroup: { findMany: vi.fn() },
  courseMaterial: { findFirst: vi.fn() },
  reportSnapshot: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  submission: { findFirst: vi.fn() },
  teacher: { findFirst: vi.fn() },
}));
const transactionClientMock = vi.hoisted(() => ({
  auditRows: [] as unknown[],
  reportSnapshot: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
const getTeacherStudentGradebookMock = vi.hoisted(() => vi.fn());
const listAttendanceHistoryForStudentMock = vi.hoisted(() => vi.fn());
const listProgressNotesForTeacherStudentMock = vi.hoisted(() => vi.fn());
const renderReportSnapshotPdfMock = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());
const getURLMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());

let committedAuditRows: unknown[] = [];

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
vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  createStorageService: () => ({
    delete: deleteMock,
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

function queryIncludesReference(input: unknown, field: string, references: string[] | undefined) {
  const where = (input as { where?: Record<string, unknown> } | null)?.where;
  const filter = where?.[field] as { in?: unknown } | undefined;
  const aliases = Array.isArray(filter?.in) ? filter.in : [];
  return references?.some((reference) => aliases.includes(reference)) ?? false;
}

function prepareReportExport(
  oldPdfStorageKey: string | null = OLD_REPORT_KEY,
  references: StorageReferences = {},
  replacementStorageKey = NEW_REPORT_KEY,
) {
  const before = snapshot({ pdfStorageKey: oldPdfStorageKey });
  const after = snapshot({
    pdfGeneratedAt: new Date("2026-05-21T11:00:00.000Z"),
    pdfStorageKey: replacementStorageKey,
  });
  prismaMock.reportSnapshot.findFirst.mockReset();
  prismaMock.reportSnapshot.findFirst.mockImplementation(async (input: unknown) => {
    const where = (input as { where?: { id?: string } } | null)?.where;
    if (where?.id) return before;
    return queryIncludesReference(input, "pdfStorageKey", references.reportSnapshot)
      ? { id: "report-reference" }
      : null;
  });
  prismaMock.attachment.findFirst.mockImplementation(async (input: unknown) =>
    queryIncludesReference(input, "storageKey", references.attachment)
      ? { id: "attachment-reference" }
      : null,
  );
  prismaMock.courseMaterial.findFirst.mockImplementation(async (input: unknown) =>
    queryIncludesReference(input, "fileUrl", references.courseMaterial)
      ? { id: "material-reference" }
      : null,
  );
  prismaMock.submission.findFirst.mockImplementation(async (input: unknown) =>
    queryIncludesReference(input, "contentUrl", references.submission)
      ? { id: "submission-reference" }
      : null,
  );
  prismaMock.teacher.findFirst.mockImplementation(async (input: unknown) =>
    queryIncludesReference(input, "photoUrl", references.teacher)
      ? { id: "teacher-reference" }
      : null,
  );
  transactionClientMock.reportSnapshot.findFirst.mockResolvedValueOnce(before);
  transactionClientMock.reportSnapshot.update.mockResolvedValueOnce(after);
  uploadMock.mockResolvedValueOnce(replacementStorageKey);
  getURLMock.mockReturnValueOnce(storageUrlForKey(replacementStorageKey));
  return { after, before };
}

describe("report-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    committedAuditRows = [];
    transactionClientMock.auditRows = [];
    prismaMock.$transaction.mockImplementation(
      async (callback: (transaction: typeof transactionClientMock) => Promise<unknown>) => {
        transactionClientMock.auditRows = [];
        const result = await callback(transactionClientMock);
        committedAuditRows.push(...transactionClientMock.auditRows);
        return result;
      },
    );
    createAdminAuditLogMock.mockImplementation(
      async (payload: unknown, database: typeof transactionClientMock) => {
        database.auditRows.push(payload);
      },
    );
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
    transactionClientMock.reportSnapshot.findFirst.mockResolvedValue(snapshot());
    transactionClientMock.reportSnapshot.update.mockResolvedValue(
      snapshot({
        pdfGeneratedAt: new Date("2026-05-21T11:00:00.000Z"),
        pdfStorageKey:
          "private/teachers/teacher-1/reports/00000000-0000-4000-8000-000000000002-report.pdf",
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
    uploadMock.mockResolvedValue(
      "private/teachers/teacher-1/reports/00000000-0000-4000-8000-000000000002-report.pdf",
    );
    getURLMock.mockReturnValue(
      "/api/files/cHJpdmF0ZS90ZWFjaGVycy90ZWFjaGVyLTEvcmVwb3J0cy8wMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDItcmVwb3J0LnBkZg",
    );
    deleteMock.mockResolvedValue(undefined);
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

  it("uploads first, then atomically updates the teacher-owned snapshot and commits the export audit", async () => {
    prepareReportExport();
    const { exportReportSnapshotPdf } = await loadReportRepository();
    const result = await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "snapshot-1", generatedByTeacherId: "teacher-1" }),
      }),
    );
    expect(renderReportSnapshotPdfMock).toHaveBeenCalledWith(snapshot().snapshotData);
    expect(uploadMock).toHaveBeenCalledWith(expect.any(Buffer), {
      filename: "amina-yusuf-spring-2026.pdf",
      namespace: "private/teachers/teacher-1/reports",
      contentType: "application/pdf",
    });
    expect(uploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.$transaction.mock.invocationCallOrder[0],
    );
    expect(transactionClientMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { id: "snapshot-1", generatedByTeacherId: "teacher-1" },
    });
    expect(transactionClientMock.reportSnapshot.update).toHaveBeenCalledWith({
      where: {
        id: "snapshot-1",
        generatedByTeacherId: "teacher-1",
        updatedAt: new Date("2026-05-20T10:01:00.000Z"),
      },
      data: {
        pdfGeneratedAt: expect.any(Date),
        pdfStorageKey: NEW_REPORT_KEY,
      },
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_PDF_EXPORTED",
        before: {
          pdfGeneratedAt: "2026-05-21T10:00:00.000Z",
          pdfStorageKey: OLD_REPORT_KEY,
        },
        after: {
          pdfGeneratedAt: "2026-05-21T11:00:00.000Z",
          pdfStorageKey: NEW_REPORT_KEY,
        },
        targetId: "snapshot-1",
        targetType: "reportSnapshot",
        meta: {
          teacherId: "teacher-1",
          reportSnapshotId: "snapshot-1",
          storageKey: NEW_REPORT_KEY,
          pdfStorageKey: NEW_REPORT_KEY,
          pdfGeneratedAt: "2026-05-21T11:00:00.000Z",
        },
      }),
      transactionClientMock,
    );
    expect(committedAuditRows).toEqual([
      expect.objectContaining({ action: "REPORT_PDF_EXPORTED", targetId: "snapshot-1" }),
    ]);
    const oldAliases = [OLD_REPORT_KEY, storageUrlForKey(OLD_REPORT_KEY)];
    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: { in: oldAliases } },
      select: { id: true },
    });
    expect(prismaMock.attachment.findFirst).toHaveBeenCalledWith({
      where: { storageKey: { in: oldAliases } },
      select: { id: true },
    });
    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith({
      where: { fileUrl: { in: oldAliases } },
      select: { id: true },
    });
    expect(prismaMock.submission.findFirst).toHaveBeenCalledWith({
      where: { contentUrl: { in: oldAliases } },
      select: { id: true },
    });
    expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith({
      where: { photoUrl: { in: oldAliases } },
      select: { id: true },
    });
    expect(deleteMock).toHaveBeenCalledWith(OLD_REPORT_KEY);
    expect(deleteMock).not.toHaveBeenCalledWith(NEW_REPORT_KEY);
    expect(result).toEqual(
      expect.objectContaining({
        publicUrl: storageUrlForKey(NEW_REPORT_KEY),
        storageKey: NEW_REPORT_KEY,
      }),
    );
    expect(getTeacherStudentGradebookMock).not.toHaveBeenCalled();
    expect(listAttendanceHistoryForStudentMock).not.toHaveBeenCalled();
  });

  it("deletes only the new upload and commits no audit when the snapshot update fails", async () => {
    prepareReportExport();
    const updateError = new Error("snapshot update failed");
    transactionClientMock.reportSnapshot.update.mockReset();
    transactionClientMock.reportSnapshot.update.mockRejectedValueOnce(updateError);
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).rejects.toBe(updateError);

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(committedAuditRows).toEqual([]);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(NEW_REPORT_KEY);
    expect(deleteMock).not.toHaveBeenCalledWith(OLD_REPORT_KEY);
  });

  it("rolls back the update, deletes only the new upload, and leaves no committed audit when audit fails", async () => {
    prepareReportExport();
    const auditError = new Error("report export audit failed");
    createAdminAuditLogMock.mockImplementationOnce(
      async (payload: unknown, database: typeof transactionClientMock) => {
        database.auditRows.push(payload);
        throw auditError;
      },
    );
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).rejects.toBe(auditError);

    expect(transactionClientMock.reportSnapshot.update).toHaveBeenCalled();
    expect(committedAuditRows).toEqual([]);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(NEW_REPORT_KEY);
    expect(deleteMock).not.toHaveBeenCalledWith(OLD_REPORT_KEY);
  });

  it("preserves the transaction error when rollback cleanup of the new upload also fails", async () => {
    prepareReportExport();
    const updateError = new Error("original snapshot update failure");
    transactionClientMock.reportSnapshot.update.mockReset();
    transactionClientMock.reportSnapshot.update.mockRejectedValueOnce(updateError);
    deleteMock.mockRejectedValueOnce(new Error("rollback cleanup failed"));
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).rejects.toBe(updateError);

    expect(deleteMock).toHaveBeenCalledWith(NEW_REPORT_KEY);
    expect(committedAuditRows).toEqual([]);
  });

  it("re-checks teacher ownership inside the transaction before updating or auditing", async () => {
    prepareReportExport();
    transactionClientMock.reportSnapshot.findFirst.mockReset();
    transactionClientMock.reportSnapshot.findFirst.mockResolvedValueOnce(null);
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).rejects.toThrow(/not found/i);

    expect(transactionClientMock.reportSnapshot.update).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(deleteMock).toHaveBeenCalledWith(NEW_REPORT_KEY);
    expect(committedAuditRows).toEqual([]);
  });

  it("normalizes and deletes an unreferenced trusted legacy report key after commit", async () => {
    prepareReportExport(`/${LEGACY_REPORT_KEY}`);
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).resolves.toEqual(
      expect.objectContaining({ storageKey: NEW_REPORT_KEY }),
    );

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: { in: LEGACY_REPORT_ALIASES } },
      select: { id: true },
    });
    expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith({
      where: { photoUrl: { in: LEGACY_REPORT_ALIASES } },
      select: { id: true },
    });
    expect(deleteMock).toHaveBeenCalledWith(LEGACY_REPORT_KEY);
  });

  it("passes repository-normalized legacy cleanup through the actual R2 adapter", async () => {
    prepareReportExport(`/${LEGACY_REPORT_KEY}`);
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    const normalizedCleanupKey = deleteMock.mock.calls[0]?.[0] as string;
    expect(normalizedCleanupKey).toBe(LEGACY_REPORT_KEY);

    const service = new R2StorageService(R2_TEST_CONFIG);
    const client = Reflect.get(service, "client") as {
      send(command: unknown): Promise<unknown>;
    };
    const sendSpy = vi.spyOn(client, "send").mockResolvedValue({});

    await service.delete(normalizedCleanupKey);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({
      Bucket: R2_TEST_CONFIG.bucket,
      Key: LEGACY_REPORT_KEY,
    });
  });

  it("normalizes a canonical current previous value and deletes its unreferenced raw key", async () => {
    prepareReportExport(storageUrlForKey(OLD_REPORT_KEY));
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(deleteMock).toHaveBeenCalledWith(OLD_REPORT_KEY);
  });

  it("retains a raw current key referenced through its canonical current alias", async () => {
    const canonicalOldUrl = storageUrlForKey(OLD_REPORT_KEY);
    prepareReportExport(OLD_REPORT_KEY, { reportSnapshot: [canonicalOldUrl] });
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: { in: [OLD_REPORT_KEY, canonicalOldUrl] } },
      select: { id: true },
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("normalizes a bare legacy previous value and retains its aliased live reference", async () => {
    prepareReportExport("reports/old-report.pdf", {
      reportSnapshot: [`/${LEGACY_REPORT_KEY}`],
    });
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: { in: LEGACY_REPORT_ALIASES } },
      select: { id: true },
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "current attachment key",
      model: "attachment" as const,
      previous: storageUrlForKey(OLD_REPORT_KEY),
      reference: OLD_REPORT_KEY,
    },
    {
      label: "legacy material URL",
      model: "courseMaterial" as const,
      previous: `/${LEGACY_REPORT_KEY}`,
      reference: "reports/old-report.pdf",
    },
    {
      label: "legacy submission URL",
      model: "submission" as const,
      previous: LEGACY_REPORT_KEY,
      reference: `/public/${LEGACY_REPORT_KEY}`,
    },
    {
      label: "legacy teacher photo URL",
      model: "teacher" as const,
      previous: `public/${LEGACY_REPORT_KEY}`,
      reference: `/${LEGACY_REPORT_KEY}`,
    },
  ])("retains an old object referenced by a cross-model $label", async (testCase) => {
    prepareReportExport(testCase.previous, {
      [testCase.model]: [testCase.reference],
    } as StorageReferences);
    const referenceLookupMocks = {
      attachment: prismaMock.attachment.findFirst,
      courseMaterial: prismaMock.courseMaterial.findFirst,
      submission: prismaMock.submission.findFirst,
      teacher: prismaMock.teacher.findFirst,
    };
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(referenceLookupMocks[testCase.model]).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("does not delete when canonical previous and raw replacement normalize to the same key", async () => {
    prepareReportExport(storageUrlForKey(OLD_REPORT_KEY), {}, OLD_REPORT_KEY);
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(prismaMock.attachment.findFirst).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("retains the old object when a cross-model reference query fails", async () => {
    prepareReportExport();
    prismaMock.attachment.findFirst.mockRejectedValueOnce(new Error("reference query failed"));
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).resolves.toEqual(
      expect.objectContaining({ storageKey: NEW_REPORT_KEY }),
    );

    expect(prismaMock.attachment.findFirst).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://cdn.example.com/reports/external.pdf",
    "private/teachers/teacher-1/reports/file name.pdf",
    "private/teachers/teacher-2/reports/foreign.pdf",
    storageUrlForKey("private/teachers/teacher-2/reports/foreign.pdf"),
    storageUrlForKey("public/teachers/admin-1/report.pdf"),
  ])(
    "does not delete an external, malformed, or untrusted previous value: %s",
    async (oldValue) => {
      prepareReportExport(oldValue);
      const { exportReportSnapshotPdf } = await loadReportRepository();

      await exportReportSnapshotPdf("teacher-1", "snapshot-1");

      expect(deleteMock).not.toHaveBeenCalled();
      expect(committedAuditRows).toHaveLength(1);
    },
  );

  it("does not delete a previous report key that remains referenced after commit", async () => {
    prepareReportExport(OLD_REPORT_KEY, { reportSnapshot: [OLD_REPORT_KEY] });
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(deleteMock).not.toHaveBeenCalled();
    expect(committedAuditRows).toHaveLength(1);
  });

  it("keeps a legacy report object referenced through an equivalent persisted URL form", async () => {
    prepareReportExport(`/${LEGACY_REPORT_KEY}`, {
      reportSnapshot: [`public/${LEGACY_REPORT_KEY}`],
    });
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: { in: LEGACY_REPORT_ALIASES } },
      select: { id: true },
    });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(committedAuditRows).toHaveLength(1);
  });

  it("returns the committed export when old-key cleanup fails", async () => {
    prepareReportExport();
    deleteMock.mockRejectedValueOnce(new Error("old object cleanup failed"));
    const { exportReportSnapshotPdf } = await loadReportRepository();

    await expect(exportReportSnapshotPdf("teacher-1", "snapshot-1")).resolves.toEqual(
      expect.objectContaining({ storageKey: NEW_REPORT_KEY }),
    );

    expect(committedAuditRows).toHaveLength(1);
    expect(deleteMock).toHaveBeenCalledWith(OLD_REPORT_KEY);
  });
});
