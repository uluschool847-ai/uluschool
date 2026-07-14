import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: UserRole; email: string } | null = null;

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: UserRole[]) => {
    if (!mockSession) throw new Error("Unauthorized");
    if (!allowedRoles.includes(mockSession.role)) throw new Error("Forbidden");
    return mockSession;
  }),
}));

const buildReportPreviewMock = vi.hoisted(() => vi.fn());
const saveReportSnapshotMock = vi.hoisted(() => vi.fn());
const exportReportSnapshotPdfMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/report-repository", () => ({
  buildReportPreview: buildReportPreviewMock,
  exportReportSnapshotPdf: exportReportSnapshotPdfMock,
  saveReportSnapshot: saveReportSnapshotMock,
}));
vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type ReportActionsModule = {
  buildReportPreviewAction: (payload: Record<string, unknown>) => Promise<unknown>;
  saveReportSnapshotAction: (payload: Record<string, unknown>) => Promise<unknown>;
  exportReportSnapshotPdfAction: (snapshotId: string) => Promise<unknown>;
};

function loadReportActions() {
  const specifier = "@/app/portal/teacher/actions/report-actions";
  return import(/* @vite-ignore */ specifier) as Promise<ReportActionsModule>;
}

const previewPayload = {
  studentId: "student-1",
  academicTermId: "term-1",
  teacherId: "spoofed-teacher",
};

const snapshotPayload = {
  academicTermId: "term-1",
  classGroupId: "group-1",
  snapshotData: {
    student: { id: "student-1", fullName: "Amina Yusuf" },
    academicTerm: { id: "term-1", name: "Spring 2026" },
    grades: { weightedTermAverage: 90 },
    attendance: { present: 8 },
    generatedByTeacherId: "teacher-1",
    generatedAt: "2026-05-20T10:00:00.000Z",
    snapshotVersion: 1,
  },
  studentId: "student-1",
  teacherComment: "Keep practicing",
  teacherId: "spoofed-teacher",
};

describe("teacher report actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "teacher-1", role: UserRole.TEACHER, email: "teacher@test.local" };
    buildReportPreviewMock.mockResolvedValue(snapshotPayload.snapshotData);
    saveReportSnapshotMock.mockResolvedValue({
      id: "snapshot-1",
      studentId: "student-1",
      classGroupId: "group-1",
      academicTermId: "term-1",
      generatedByTeacherId: "teacher-1",
      snapshotVersion: 1,
    });
    exportReportSnapshotPdfMock.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      filename: "report.pdf",
      contentType: "application/pdf",
      snapshot: { id: "snapshot-1", studentId: "student-1" },
    });
  });

  it("uses teacher guard, dedicated report repository, and no hidden teacherId trust", () => {
    const source = readFileSync("app/portal/teacher/actions/report-actions.ts", "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).not.toMatch(/teacherId\s*:\s*(payload|data|parsed\.data)\.teacherId/);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before report mutation",
    async (role) => {
      mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.local` };
      const actions = await loadReportActions();

      await expect(actions.saveReportSnapshotAction(snapshotPayload)).rejects.toThrow();
      expect(saveReportSnapshotMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("builds preview with session teacher id and audits preview generation", async () => {
    const { buildReportPreviewAction } = await loadReportActions();
    await buildReportPreviewAction(previewPayload);

    expect(buildReportPreviewMock).toHaveBeenCalledWith("teacher-1", "student-1", "term-1");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_PREVIEW_GENERATED",
        actorId: "teacher-1",
        meta: expect.objectContaining({
          teacherId: "teacher-1",
          studentId: "student-1",
          academicTermId: "term-1",
        }),
      }),
      expect.anything(),
    );
  });

  it("saves snapshot, audits lifecycle event, and revalidates affected portals", async () => {
    const { saveReportSnapshotAction } = await loadReportActions();
    await saveReportSnapshotAction(snapshotPayload);

    expect(saveReportSnapshotMock).toHaveBeenCalledWith("teacher-1", {
      academicTermId: "term-1",
      classGroupId: "group-1",
      snapshotData: snapshotPayload.snapshotData,
      studentId: "student-1",
      teacherComment: "Keep practicing",
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_SNAPSHOT_SAVED",
        targetId: "snapshot-1",
        targetType: "reportSnapshot",
        meta: expect.objectContaining({
          teacherId: "teacher-1",
          studentId: "student-1",
          classGroupId: "group-1",
          academicTermId: "term-1",
          reportSnapshotId: "snapshot-1",
          snapshotVersion: 1,
        }),
      }),
      expect.anything(),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/reports");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/students/student-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
  });

  it("delegates the audited export lifecycle to the repository and revalidates after commit", async () => {
    const { exportReportSnapshotPdfAction } = await loadReportActions();
    await exportReportSnapshotPdfAction("snapshot-1");

    expect(exportReportSnapshotPdfMock).toHaveBeenCalledWith("teacher-1", "snapshot-1");
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/reports/snapshot-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student/reports/snapshot-1");
  });

  it("does not audit or revalidate when the transactional export fails", async () => {
    exportReportSnapshotPdfMock.mockRejectedValueOnce(
      new Error("report export transaction failed"),
    );
    const { exportReportSnapshotPdfAction } = await loadReportActions();

    const result = await exportReportSnapshotPdfAction("snapshot-1");

    expect(result).toEqual({ success: false, error: "report export transaction failed" });
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not audit failed validation or ownership errors", async () => {
    saveReportSnapshotMock.mockRejectedValueOnce(new Error("Student is not assigned"));
    const { saveReportSnapshotAction } = await loadReportActions();

    const result = await saveReportSnapshotAction(snapshotPayload);

    expect(JSON.stringify(result)).toMatch(/assigned|error|failed/i);
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });
});
