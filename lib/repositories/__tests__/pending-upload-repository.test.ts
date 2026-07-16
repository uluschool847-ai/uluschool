import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  activeStorageObject: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  appUser: { findUnique: vi.fn() },
  attachment: { findMany: vi.fn() },
  courseMaterial: { findMany: vi.fn() },
  pendingUpload: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  reportSnapshot: { findMany: vi.fn() },
  teacher: { findMany: vi.fn() },
}));
const getStorageObjectReferenceStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/repositories/storage-reference-repository", () => ({
  getStorageObjectReferenceStatus: getStorageObjectReferenceStatusMock,
}));

import {
  MAX_OUTSTANDING_PENDING_UPLOADS,
  PendingUploadError,
  consumePendingUploadRequestRateLimit,
  finalizePendingUploads,
  queueStorageObjectForDeletion,
  releasePendingUpload,
  reservePendingUpload,
  sweepExpiredPendingUploads,
} from "@/lib/repositories/pending-upload-repository";

const ownerId = "teacher-1";
const storageKey = "private/teachers/teacher-1/materials/worksheet.pdf";
const now = new Date("2026-07-16T12:00:00.000Z");
const expiredAt = new Date("2026-07-16T11:00:00.000Z");

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "pending-1",
    ownerId,
    purpose: "course-material",
    storageKey,
    filename: "worksheet.pdf",
    mimeType: "application/pdf",
    byteSize: 128,
    expiresAt: new Date("2026-07-16T13:00:00.000Z"),
    claimToken: null,
    claimedAt: null,
    createdAt: now,
    ...overrides,
  };
}

function upload(overrides: Record<string, unknown> = {}) {
  return {
    ownerId,
    purpose: "course-material" as const,
    storageKey,
    filename: "worksheet.pdf",
    mimeType: "application/pdf",
    byteSize: 128,
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
    prismaMock.pendingUpload.findUnique.mockResolvedValue(null);
    prismaMock.pendingUpload.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.pendingUpload.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pendingUpload.create.mockResolvedValue(reservation());
    prismaMock.appUser.findUnique.mockResolvedValue({ role: "TEACHER" });
    prismaMock.activeStorageObject.findMany.mockResolvedValue([]);
    prismaMock.activeStorageObject.findUnique.mockResolvedValue(null);
    prismaMock.activeStorageObject.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.activeStorageObject.create.mockResolvedValue({});
    prismaMock.attachment.findMany.mockResolvedValue([]);
    prismaMock.courseMaterial.findMany.mockResolvedValue([]);
    prismaMock.reportSnapshot.findMany.mockResolvedValue([]);
    prismaMock.teacher.findMany.mockResolvedValue([]);
    getStorageObjectReferenceStatusMock.mockResolvedValue("unreferenced");
    storage.delete.mockResolvedValue(undefined);
  });

  it("limits each authenticated owner to thirty upload requests per rolling minute", () => {
    const uniqueOwner = `${ownerId}-${Date.now()}`;
    for (let request = 0; request < 30; request += 1) {
      expect(() => consumePendingUploadRequestRateLimit(uniqueOwner, now)).not.toThrow();
    }

    expect(() => consumePendingUploadRequestRateLimit(uniqueOwner, now)).toThrow(
      PendingUploadError,
    );
    expect(() => consumePendingUploadRequestRateLimit(`${uniqueOwner}-other`, now)).not.toThrow();
  });

  it("retains and releases the same durable row when reference lookup is uncertain", async () => {
    const expired = reservation({ expiresAt: expiredAt });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    getStorageObjectReferenceStatusMock.mockResolvedValueOnce("unknown");

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 1 })).resolves.toEqual(
      expect.objectContaining({
        claimed: 1,
        lookupFailures: 1,
        released: 1,
        durabilityFailures: 0,
      }),
    );

    expect(storage.delete).not.toHaveBeenCalled();
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
    expect(prismaMock.pendingUpload.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.pendingUpload.updateMany).toHaveBeenLastCalledWith({
      where: { id: "pending-1", claimToken: expect.any(String) },
      data: { claimToken: null, claimedAt: null },
    });
  });

  it("releases the same row after storage deletion fails instead of recreating it", async () => {
    const expired = reservation({ expiresAt: expiredAt });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    storage.delete.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 1 })).resolves.toEqual(
      expect.objectContaining({
        claimed: 1,
        storageFailures: 1,
        released: 1,
        durabilityFailures: 0,
      }),
    );
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
    expect(prismaMock.pendingUpload.deleteMany).not.toHaveBeenCalled();
  });

  it("surfaces a durability failure when a claim cannot be released", async () => {
    const expired = reservation({ expiresAt: expiredAt });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error("database unavailable"));
    getStorageObjectReferenceStatusMock.mockResolvedValueOnce("unknown");

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 1 })).resolves.toEqual(
      expect.objectContaining({
        claimed: 1,
        lookupFailures: 1,
        released: 0,
        durabilityFailures: 1,
      }),
    );
    expect(prismaMock.pendingUpload.deleteMany).not.toHaveBeenCalled();
  });

  it("recovers a stale claim lease and deletes only after external storage succeeds", async () => {
    const staleClaimedAt = new Date("2026-07-16T11:00:00.000Z");
    const expired = reservation({
      expiresAt: expiredAt,
      claimToken: "dead-worker",
      claimedAt: staleClaimedAt,
    });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 1 })).resolves.toEqual(
      expect.objectContaining({ claimed: 1, deleted: 1, durabilityFailures: 0 }),
    );

    expect(prismaMock.pendingUpload.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "pending-1",
        OR: expect.arrayContaining([
          expect.objectContaining({
            claimedAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        ]),
      }),
      data: { claimToken: expect.any(String), claimedAt: now },
    });
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
    expect(prismaMock.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { id: "pending-1", claimToken: expect.any(String) },
    });
  });

  it("converts a positively referenced expired reservation to active accounting atomically", async () => {
    const expired = reservation({ expiresAt: expiredAt });
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([expired]);
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(expired);
    prismaMock.pendingUpload.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });
    getStorageObjectReferenceStatusMock.mockResolvedValueOnce("referenced");

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 1 })).resolves.toEqual(
      expect.objectContaining({ claimed: 1, referenced: 1, deleted: 0 }),
    );

    expect(prismaMock.activeStorageObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId,
        purpose: "course-material",
        storageKey,
        byteSize: 128,
      }),
    });
    expect(prismaMock.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: { id: "pending-1", claimToken: expect.any(String) },
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("requires an explicit transaction client and rejects root Prisma finalization", async () => {
    await expect(
      finalizePendingUploads(
        { ...({ ownerId, purpose: "course-material", uploads: [upload()], now } as const) },
        prismaMock,
      ),
    ).rejects.toThrow(PendingUploadError);
    expect(prismaMock.pendingUpload.findMany).not.toHaveBeenCalled();
  });

  it("finalizes exact metadata into active accounting before removing pending rows", async () => {
    const transaction = {
      activeStorageObject: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(null),
      },
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
          uploads: [upload()],
          now,
        },
        transaction,
      ),
    ).resolves.toBeUndefined();

    expect(transaction.activeStorageObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerId, storageKey, byteSize: 128 }),
    });
    expect(transaction.pendingUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["pending-1"] },
        ownerId,
        purpose: "course-material",
        expiresAt: { gt: now },
        claimToken: null,
      },
    });
  });

  it("counts expired, claimed, and retry rows toward the exact twenty-object cap", async () => {
    prismaMock.pendingUpload.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(
      Array.from({ length: MAX_OUTSTANDING_PENDING_UPLOADS }, (_, index) =>
        reservation({
          id: `pending-${index}`,
          storageKey: `${storageKey}-${index}`,
          expiresAt: index % 2 === 0 ? expiredAt : new Date("2026-07-16T13:00:00.000Z"),
          claimToken: index % 3 === 0 ? `worker-${index}` : null,
          claimedAt: index % 3 === 0 ? now : null,
        }),
      ),
    );

    await expect(reservePendingUpload({ ...upload(), storage, now })).rejects.toThrow(
      PendingUploadError,
    );
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
    expect(prismaMock.pendingUpload.findMany).toHaveBeenLastCalledWith({
      where: { ownerId },
      select: { storageKey: true, byteSize: true },
    });
  });

  it("conservatively blocks quota growth for a pre-existing unledgered report PDF", async () => {
    prismaMock.reportSnapshot.findMany.mockResolvedValueOnce([
      { pdfStorageKey: "private/teachers/teacher-1/reports/legacy-report.pdf" },
    ]);

    await expect(reservePendingUpload({ ...upload(), storage, now })).rejects.toThrow(
      PendingUploadError,
    );
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
  });

  it.each([
    ["current application URL", "private/teachers/teacher-1/materials/file-url-only.pdf"],
    ["legacy alias", "/uploads/teacher-1/file-url-only.pdf"],
  ])("blocks quota growth for an unledgered fileUrl-only material %s", async (_label, fileUrl) => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([{ fileUrl }]);

    await expect(reservePendingUpload({ ...upload(), storage, now })).rejects.toThrow(
      PendingUploadError,
    );
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
  });

  it.each([
    ["external HTTPS", "https://cdn.example.com/report.pdf"],
    ["root static", "/images/teacher-photo.webp"],
  ])(
    "does not block quota growth for a proved non-storage report reference: %s",
    async (_label, pdfStorageKey) => {
      prismaMock.reportSnapshot.findMany.mockResolvedValueOnce([{ pdfStorageKey }]);

      await expect(reservePendingUpload({ ...upload(), storage, now })).resolves.toEqual(
        expect.objectContaining({ storageKey }),
      );
    },
  );

  it("keeps malformed storage-looking report references fail-closed", async () => {
    prismaMock.reportSnapshot.findMany.mockResolvedValueOnce([
      { pdfStorageKey: "/api/files/not-a-valid-storage-token" },
    ]);

    await expect(reservePendingUpload({ ...upload(), storage, now })).rejects.toThrow(
      PendingUploadError,
    );
  });

  it.each([
    ["external HTTPS", "https://cdn.example.com/teacher-photo.webp"],
    ["root static", "/images/teacher-photo.webp"],
  ])(
    "does not block administrators for a proved non-storage teacher photo: %s",
    async (_label, photoUrl) => {
      prismaMock.appUser.findUnique.mockResolvedValueOnce({ role: "ADMIN" });
      prismaMock.teacher.findMany.mockResolvedValueOnce([{ photoUrl }]);

      await expect(reservePendingUpload({ ...upload(), storage, now })).resolves.toEqual(
        expect.objectContaining({ storageKey }),
      );
    },
  );

  it("keeps malformed storage-looking teacher photos fail-closed", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({ role: "ADMIN" });
    prismaMock.teacher.findMany.mockResolvedValueOnce([
      { photoUrl: "/api/files/not-a-valid-storage-token" },
    ]);

    await expect(reservePendingUpload({ ...upload(), storage, now })).rejects.toThrow(
      PendingUploadError,
    );
  });

  it("conservatively blocks administrators when a legacy teacher photo has no owner ledger", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({ role: "ADMIN" });
    prismaMock.teacher.findMany.mockResolvedValueOnce([
      { photoUrl: "/public/uploads/teachers/legacy-photo.webp" },
    ]);

    await expect(reservePendingUpload({ ...upload(), storage, now })).rejects.toThrow(
      PendingUploadError,
    );
    expect(prismaMock.pendingUpload.create).not.toHaveBeenCalled();
  });

  it("keeps cancellation owner-scoped while using the durable lease", async () => {
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(reservation());
    prismaMock.pendingUpload.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(releasePendingUpload({ ownerId, storageKey, storage, now })).resolves.toEqual(
      expect.objectContaining({ claimed: true, deleted: true }),
    );
    expect(prismaMock.pendingUpload.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ ownerId, storageKey }),
    });

    storage.delete.mockClear();
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(null);
    await expect(
      releasePendingUpload({ ownerId: "teacher-2", storageKey, storage, now }),
    ).resolves.toEqual(expect.objectContaining({ claimed: false, deleted: false }));
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("normalizes a queued legacy alias before owner-scoped release", async () => {
    const legacyKey = "uploads/materials/legacy.pdf";
    prismaMock.pendingUpload.findFirst.mockResolvedValueOnce(
      reservation({ storageKey: legacyKey }),
    );
    prismaMock.pendingUpload.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.pendingUpload.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      releasePendingUpload({
        ownerId,
        storageKey: `/public/${legacyKey}`,
        storage,
        now,
      }),
    ).resolves.toEqual(expect.objectContaining({ claimed: true, deleted: true }));
    expect(prismaMock.pendingUpload.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ ownerId, storageKey: legacyKey }),
    });
    expect(storage.delete).toHaveBeenCalledWith(legacyKey);
  });

  it("atomically transitions an unreferenced active object back to pending cleanup", async () => {
    const transaction = {
      activeStorageObject: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: "active-1",
          ownerId,
          purpose: "course-material",
          storageKey,
          filename: "worksheet.pdf",
          mimeType: "application/pdf",
          byteSize: 128,
        }),
      },
      pendingUpload: {
        create: vi.fn().mockResolvedValue(reservation({ expiresAt: now })),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(
      queueStorageObjectForDeletion(
        {
          ownerId,
          purpose: "course-material",
          storageKey,
          filename: "fallback.pdf",
          mimeType: "application/octet-stream",
          byteSize: 64,
          now,
        },
        transaction,
      ),
    ).resolves.toEqual(expect.objectContaining({ ownerId, storageKey }));

    expect(transaction.pendingUpload.create).toHaveBeenCalledWith({
      data: {
        ownerId,
        purpose: "course-material",
        storageKey,
        filename: "worksheet.pdf",
        mimeType: "application/pdf",
        byteSize: 128,
        expiresAt: now,
      },
    });
    expect(transaction.activeStorageObject.deleteMany).toHaveBeenCalledWith({
      where: { id: "active-1", storageKey },
    });
  });

  it("fails the caller transaction on uncertain orphan lookup without changing accounting", async () => {
    const transaction = {
      activeStorageObject: {
        deleteMany: vi.fn(),
        findUnique: vi.fn(),
      },
      pendingUpload: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    getStorageObjectReferenceStatusMock.mockResolvedValueOnce("unknown");

    await expect(
      queueStorageObjectForDeletion(
        {
          ownerId,
          purpose: "course-material",
          storageKey,
          filename: "worksheet.pdf",
          mimeType: "application/pdf",
          byteSize: 128,
          now,
        },
        transaction,
      ),
    ).rejects.toThrow(PendingUploadError);
    expect(transaction.pendingUpload.create).not.toHaveBeenCalled();
    expect(transaction.activeStorageObject.deleteMany).not.toHaveBeenCalled();
  });

  it("retains active accounting when another live alias still references the object", async () => {
    const transaction = {
      activeStorageObject: {
        deleteMany: vi.fn(),
        findUnique: vi.fn(),
      },
      pendingUpload: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    getStorageObjectReferenceStatusMock.mockResolvedValueOnce("referenced");

    await expect(
      queueStorageObjectForDeletion(
        {
          ownerId,
          purpose: "course-material",
          storageKey,
          filename: "worksheet.pdf",
          mimeType: "application/pdf",
          byteSize: 128,
          now,
        },
        transaction,
      ),
    ).resolves.toBeNull();
    expect(transaction.pendingUpload.create).not.toHaveBeenCalled();
    expect(transaction.activeStorageObject.deleteMany).not.toHaveBeenCalled();
  });
});
