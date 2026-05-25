import { describe, expect, it, vi } from "vitest";

type ReportPdfModule = {
  renderReportSnapshotPdf: (snapshotData: Record<string, unknown>) => Promise<{
    bytes: Uint8Array;
    contentType: string;
    filename: string;
  }>;
};

function loadReportPdfService() {
  const specifier = "@/lib/services/report-pdf";
  return import(/* @vite-ignore */ specifier) as Promise<ReportPdfModule>;
}

describe("report PDF renderer contract", () => {
  it("exports a renderer boundary that accepts saved snapshot data", async () => {
    const service = await loadReportPdfService();

    expect(service).toEqual(
      expect.objectContaining({
        renderReportSnapshotPdf: expect.any(Function),
      }),
    );
  });

  it("renders from snapshot data without querying live repositories", async () => {
    vi.doMock("@/lib/repositories/gradebook-repository", () => ({
      getTeacherStudentGradebook: vi.fn(() => {
        throw new Error("PDF export must not query live gradebook");
      }),
    }));
    vi.doMock("@/lib/repositories/attendance-repository", () => ({
      listAttendanceHistoryForStudent: vi.fn(() => {
        throw new Error("PDF export must not query live attendance");
      }),
    }));

    const { renderReportSnapshotPdf } = await loadReportPdfService();
    const result = await renderReportSnapshotPdf({
      student: { fullName: "Amina Yusuf" },
      academicTerm: { name: "Spring 2026" },
      grades: { weightedTermAverage: 90 },
      attendance: { present: 8, late: 1, absent: 1 },
      progressNotes: [{ content: "Strong progress" }],
      teacherComment: "Keep practicing",
      snapshotVersion: 1,
    });

    expect(result).toEqual(
      expect.objectContaining({
        bytes: expect.any(Uint8Array),
        contentType: "application/pdf",
        filename: expect.stringMatching(/amina|report|pdf/i),
      }),
    );
  });
});
