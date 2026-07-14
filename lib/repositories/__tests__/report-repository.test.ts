import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const storageUploadMock = vi.hoisted(() => vi.fn());
const storageGetUrlMock = vi.hoisted(() => vi.fn());
const renderReportSnapshotPdfMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  reportSnapshot: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/report-pdf", () => ({
  renderReportSnapshotPdf: renderReportSnapshotPdfMock,
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  createStorageService: () => ({
    upload: storageUploadMock,
    getURL: storageGetUrlMock,
  }),
}));

describe("report PDF storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads rendered bytes to the authenticated teacher report namespace and persists only key metadata", async () => {
    const storageKey = "private/teachers/teacher-1/reports/report.pdf";
    const publicUrl = storageUrlForKey(storageKey);
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce({
      id: "snapshot-1",
      studentId: "student-1",
      snapshotData: { student: { fullName: "Student One" } },
    });
    renderReportSnapshotPdfMock.mockResolvedValueOnce({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      filename: "report.pdf",
      contentType: "application/x-untrusted",
    });
    storageUploadMock.mockResolvedValueOnce(storageKey);
    storageGetUrlMock.mockReturnValueOnce(publicUrl);
    prismaMock.reportSnapshot.update.mockImplementationOnce(async ({ data }) => ({
      id: "snapshot-1",
      studentId: "student-1",
      ...data,
    }));

    const { exportReportSnapshotPdf } = await import("@/lib/repositories/report-repository");
    const result = await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(storageUploadMock).toHaveBeenCalledWith(expect.any(Buffer), {
      filename: "report.pdf",
      namespace: "private/teachers/teacher-1/reports",
      contentType: "application/pdf",
    });
    expect(Buffer.isBuffer(storageUploadMock.mock.calls[0]?.[0])).toBe(true);
    expect(prismaMock.reportSnapshot.update).toHaveBeenCalledWith({
      where: { id: "snapshot-1" },
      data: {
        pdfGeneratedAt: expect.any(Date),
        pdfStorageKey: storageKey,
      },
    });
    expect(result.publicUrl).toBe(publicUrl);
    expect(storageGetUrlMock).toHaveBeenCalledWith(storageKey);
  });
});
