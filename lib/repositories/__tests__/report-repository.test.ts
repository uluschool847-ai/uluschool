import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const storageUploadMock = vi.hoisted(() => vi.fn());
const storageGetUrlMock = vi.hoisted(() => vi.fn());
const storageDeleteMock = vi.hoisted(() => vi.fn());
const renderReportSnapshotPdfMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const isStorageObjectReferencedMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({
  reportSnapshot: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  reportSnapshot: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/report-pdf", () => ({
  renderReportSnapshotPdf: renderReportSnapshotPdfMock,
}));
vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));
vi.mock("@/lib/repositories/storage-reference-repository", () => ({
  isStorageObjectReferenced: isStorageObjectReferencedMock,
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  createStorageService: () => ({
    delete: storageDeleteMock,
    upload: storageUploadMock,
    getURL: storageGetUrlMock,
  }),
}));

describe("report PDF storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (transaction: typeof transactionClientMock) => Promise<unknown>) =>
        callback(transactionClientMock),
    );
    createAdminAuditLogMock.mockResolvedValue(undefined);
    isStorageObjectReferencedMock.mockResolvedValue(false);
    storageDeleteMock.mockResolvedValue(undefined);
  });

  it("uploads rendered bytes to the authenticated teacher report namespace and persists only key metadata", async () => {
    const storageKey = "private/teachers/teacher-1/reports/report.pdf";
    const publicUrl = storageUrlForKey(storageKey);
    const persistedSnapshot = {
      id: "snapshot-1",
      studentId: "student-1",
      snapshotData: { student: { fullName: "Student One" } },
      generatedByTeacherId: "teacher-1",
      pdfGeneratedAt: null,
      pdfStorageKey: null,
      updatedAt: new Date("2026-07-14T09:00:00.000Z"),
    };
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce(persistedSnapshot);
    transactionClientMock.reportSnapshot.findFirst.mockResolvedValueOnce(persistedSnapshot);
    renderReportSnapshotPdfMock.mockResolvedValueOnce({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      filename: "report.pdf",
      contentType: "application/x-untrusted",
    });
    storageUploadMock.mockResolvedValueOnce(storageKey);
    storageGetUrlMock.mockReturnValueOnce(publicUrl);
    transactionClientMock.reportSnapshot.update.mockImplementationOnce(async ({ data }) => ({
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
    expect(transactionClientMock.reportSnapshot.update).toHaveBeenCalledWith({
      where: {
        id: "snapshot-1",
        generatedByTeacherId: "teacher-1",
        updatedAt: new Date("2026-07-14T09:00:00.000Z"),
      },
      data: {
        pdfGeneratedAt: expect.any(Date),
        pdfStorageKey: storageKey,
      },
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_PDF_EXPORTED",
        targetId: "snapshot-1",
        meta: expect.objectContaining({ storageKey }),
      }),
      transactionClientMock,
    );
    expect(storageDeleteMock).not.toHaveBeenCalled();
    expect(result.publicUrl).toBe(publicUrl);
    expect(storageGetUrlMock).toHaveBeenCalledWith(storageKey);
  });

  it("uses the shared reference helper before deleting a superseded report PDF", async () => {
    const oldStorageKey = "private/teachers/teacher-1/reports/old-report.pdf";
    const newStorageKey = "private/teachers/teacher-1/reports/new-report.pdf";
    const persistedSnapshot = {
      id: "snapshot-1",
      studentId: "student-1",
      snapshotData: { student: { fullName: "Student One" } },
      generatedByTeacherId: "teacher-1",
      pdfGeneratedAt: null,
      pdfStorageKey: oldStorageKey,
      updatedAt: new Date("2026-07-14T09:00:00.000Z"),
    };
    prismaMock.reportSnapshot.findFirst.mockResolvedValueOnce(persistedSnapshot);
    transactionClientMock.reportSnapshot.findFirst.mockResolvedValueOnce(persistedSnapshot);
    transactionClientMock.reportSnapshot.update.mockResolvedValueOnce({
      ...persistedSnapshot,
      pdfStorageKey: newStorageKey,
    });
    renderReportSnapshotPdfMock.mockResolvedValueOnce({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      filename: "report.pdf",
      contentType: "application/pdf",
    });
    storageUploadMock.mockResolvedValueOnce(newStorageKey);
    storageGetUrlMock.mockReturnValueOnce(storageUrlForKey(newStorageKey));

    const { exportReportSnapshotPdf } = await import("@/lib/repositories/report-repository");
    await exportReportSnapshotPdf("teacher-1", "snapshot-1");

    expect(isStorageObjectReferencedMock).toHaveBeenCalledWith(oldStorageKey);
    expect(storageDeleteMock).toHaveBeenCalledWith(oldStorageKey);
  });
});
