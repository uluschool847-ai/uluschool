import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  attachment: { findMany: vi.fn() },
  pendingUpload: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));
const isStorageObjectReferencedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/repositories/storage-reference-repository", () => ({
  isStorageObjectReferenced: isStorageObjectReferencedMock,
}));

import {
  MAX_OUTSTANDING_PENDING_UPLOADS,
  PendingUploadError,
  consumePendingUploadRequestRateLimit,
  finalizePendingUploads,
  releasePendingUpload,
  reservePendingUpload,
  sweepExpiredPendingUploads,
} from "@/lib/repositories/pending-upload-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const ownerId = "teacher-1";
const storageKey = "private/teachers/teacher-1/materials/worksheet.pdf";
const now = new Date("2026-07-15T12:00:00.000Z");

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "pending-1",
    ownerId,
    purpose: "course-material",
    storageKey,
    filename: "worksheet.pdf",
    mimeType: "application/pdf",
    byteSize: 128,
    expiresAt: new Date("2026-07-15T13:00:00.000Z"),
    createdAt: now,
    ...overrides,
  };
}

const storage = { delete: vi.fn() };

describe("pending upload repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (transaction: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );
    prismaMock.pendingUpload.findMany.mockResolvedValue([]);
    prismaMock.pendingUpload.findFirst.mockResolvedValue(null);
    prismaMock.pendingUpload.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pendingUpload.create.mockResolvedValue(reservation());
    prismaMock.attachment.findMany.mockResolvedValue([]);
    isStorageObjectReferencedMock.mockResolvedValue(false);
    storage.delete.mockResolvedValue(undefined);
  });

  it("limits each authenticated owner to thirty upload requests per rolling minute", () => {
    for (let request = 0; request < 30; request += 1) {
      expect(() => consumePendingUploadRequestRateLimit(ownerId, now)).not.toThrow();
    }

    expect(() => consumePendingUploadRequestRateLimit(ownerId, now)).toThrow(PendingUploadError);
    expect(() => consumePendingUploadRequestRateLimit("teacher-2", now)).not.toThrow();
  });

  it("sweeps the owner expired reservations before serializable quota evaluation", async () => {
    const expired = reservation({ expiresAt: new Date("2026-07-15T11:00:00.000Z") });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]).mockResolvedValueOnce([]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await reservePendingUpload({
      ownerId,
      purpose: "course-material",
      storageKey,
      filename: "worksheet.pdf",
      mimeType: "application/pdf",
      byteSize: 128,
      storage,
      now,
    });

    expect(storage.delete).toHaveBeenCalledWith(storageKey);
    expect(prismaMock.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("rejects an owner that already has the maximum outstanding reservations", async () => {
    prismaMock.pendingUpload.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        Array.from({ length: MAX_OUTSTANDING_PENDING_UPLOADS }, (_, index) =>
          reservation({ id: `pending-${index}`, storageKey: `${storageKey}-${index}` }),
        ),
      );

    await expect(
      reservePendingUpload({
        ownerId,
        purpose: "course-material",
        storageKey,
        filename: "worksheet.pdf",
        mimeType: "application/pdf",
        byteSize: 128,
        storage,
        now,
      }),
    ).rejects.toThrow(PendingUploadError);
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
  });

  it("normalizes active attachment aliases before checking for a duplicate pending object", async () => {
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prismaMock.attachment.findMany.mockResolvedValueOnce([
      { storageKey: storageUrlForKey(storageKey), size: 128 },
    ]);

    await expect(
      reservePendingUpload({
        ownerId,
        purpose: "course-material",
        storageKey,
        filename: "worksheet.pdf",
        mimeType: "application/pdf",
        byteSize: 128,
        storage,
        now,
      }),
    ).rejects.toThrow(PendingUploadError);
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
  });

  it("releases a pending object only for its authenticated owner", async () => {
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(reservation());
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      releasePendingUpload({
        ownerId,
        storageKey,
        storage,
        now,
      }),
    ).resolves.toEqual({ claimed: true, deleted: true, referenced: false, retried: false });
    expect(storage.delete).toHaveBeenCalledWith(storageKey);

    storage.delete.mockClear();
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(null);
    await expect(
      releasePendingUpload({
        ownerId: "teacher-2",
        storageKey,
        storage,
        now,
      }),
    ).resolves.toEqual({ claimed: false, deleted: false, referenced: false, retried: false });
    expect(prismaMock.pendingUpload.findFirst).toHaveBeenLastCalledWith({
      where: { ownerId: "teacher-2", storageKey },
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("finalizes only owner, purpose, unexpired, metadata-exact reservations inside the supplied transaction", async () => {
    const transaction = {
      pendingUpload: {
        findMany: vi.fn().mockResolvedValue([reservation()]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      finalizePendingUploads(
        {
          ownerId,
          purpose: "course-material",
          uploads: [
            {
              storageKey,
              filename: "worksheet.pdf",
              mimeType: "application/pdf",
              byteSize: 128,
            },
          ],
          now,
        },
        transaction,
      ),
    ).resolves.toEqual(undefined);
    expect(transaction.pendingUpload.findMany).toHaveBeenCalledWith({
      where: {
        ownerId,
        purpose: "course-material",
        storageKey: { in: [storageKey] },
        expiresAt: { gt: now },
      },
    });
    expect(transaction.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["pending-1"] },
        ownerId,
        purpose: "course-material",
        expiresAt: { gt: now },
      },
    });
  });

  it.each([
    ["foreign owner", reservation({ ownerId: "teacher-2" })],
    ["expired", reservation({ expiresAt: new Date("2026-07-15T11:00:00.000Z") })],
    ["forged metadata", reservation({ byteSize: 127 })],
  ])("rejects %s reservation finalization", async (_label, row) => {
    const transaction = {
      pendingUpload: {
        findMany: vi.fn().mockResolvedValue([row]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      finalizePendingUploads(
        {
          ownerId,
          purpose: "course-material",
          uploads: [
            {
              storageKey,
              filename: "worksheet.pdf",
              mimeType: "application/pdf",
              byteSize: 128,
            },
          ],
          now,
        },
        transaction,
      ),
    ).rejects.toThrow(PendingUploadError);
    expect(transaction.pendingUpload.deleteMany).not.toHaveBeenCalled();
  });

  it("claims an expired row before deleting storage and recreates an immediately expired retry reservation on delete failure", async () => {
    const expired = reservation({ expiresAt: new Date("2026-07-15T11:00:00.000Z") });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });
    storage.delete.mockRejectedValueOnce(new Error("storage unavailable"));

    const result = await sweepExpiredPendingUploads({ storage, now, limit: 1 });

    expect(prismaMock.pendingUpload.findFirst).toHaveBeenCalledOnce();
    expect(prismaMock.pendingUpload.deleteMany).toHaveBeenCalledOnce();
    expect(result).toEqual(expect.objectContaining({ claimed: 1, deleteFailures: 1, retried: 1 }));
    expect(prismaMock.pendingUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey,
        expiresAt: now,
      }),
    });
  });

  it("removes an expired reservation without deleting a now-referenced object", async () => {
    const expired = reservation({ expiresAt: new Date("2026-07-15T11:00:00.000Z") });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });
    isStorageObjectReferencedMock.mockResolvedValueOnce(true);

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 1 })).resolves.toEqual(
      expect.objectContaining({ claimed: 1, referenced: 1, deleted: 0 }),
    );
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
  });
});
