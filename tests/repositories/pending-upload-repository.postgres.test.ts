import { Prisma, UserRole } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  deleteCourseMaterialForTeacher,
  updateCourseMaterialForTeacher,
} from "@/lib/repositories/course-material-repository";
import {
  MAX_OWNER_ACTIVE_AND_PENDING_BYTES,
  PendingUploadError,
  finalizePendingUploads,
  queueStorageObjectForDeletion,
  reservePendingUpload,
  sweepExpiredPendingUploads,
} from "@/lib/repositories/pending-upload-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const runPostgres = process.env.RUN_TASK3_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (name: string) => `t3-pending-v2-${runId}-${name}`;
const ownerId = id("teacher");
const otherOwnerId = id("other-teacher");
const adminOwnerId = id("admin");

function storageKey(name: string) {
  return `private/teachers/${ownerId}/materials/${name}.pdf`;
}

function upload(name: string, byteSize = 128) {
  return {
    ownerId,
    purpose: "course-material" as const,
    storageKey: storageKey(name),
    filename: `${name}.pdf`,
    mimeType: "application/pdf",
    byteSize,
  };
}

function pendingData(name: string, overrides: Record<string, unknown> = {}) {
  return {
    ...upload(name),
    expiresAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

async function createOwnerUsers() {
  await prisma.appUser.createMany({
    data: [
      {
        id: ownerId,
        email: `${ownerId}@example.com`,
        fullName: "Pending upload owner",
        role: UserRole.TEACHER,
        passwordHash: "not-used",
        isActive: true,
      },
      {
        id: otherOwnerId,
        email: `${otherOwnerId}@example.com`,
        fullName: "Other pending upload owner",
        role: UserRole.TEACHER,
        passwordHash: "not-used",
        isActive: true,
      },
      {
        id: adminOwnerId,
        email: `${adminOwnerId}@example.com`,
        fullName: "Pending upload administrator",
        role: UserRole.ADMIN,
        passwordHash: "not-used",
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });
}

async function cleanupFixtures() {
  const fixtureIds = { startsWith: `t3-pending-v2-${runId}-` };
  const ownerIds = [ownerId, otherOwnerId, adminOwnerId];
  await prisma.pendingUpload.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.activeStorageObject.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.courseMaterial.deleteMany({ where: { id: fixtureIds } });
  await prisma.scheduledClass.deleteMany({ where: { id: fixtureIds } });
  await prisma.appUser.deleteMany({ where: { id: { in: ownerIds } } });
}

async function createMaterialReference(name: string, size = 128) {
  const key = storageKey(name);
  const scheduledClassId = id(`class-${name}`);
  await prisma.scheduledClass.create({
    data: {
      id: scheduledClassId,
      title: `Class ${name}`,
      startAt: new Date("2026-07-16T09:00:00.000Z"),
      endAt: new Date("2026-07-16T10:00:00.000Z"),
      teacherId: ownerId,
    },
  });
  await prisma.courseMaterial.create({
    data: {
      id: id(`material-${name}`),
      title: `Material ${name}`,
      fileUrl: storageUrlForKey(key),
      scheduledClassId,
      teacherId: ownerId,
      attachments: {
        create: {
          id: id(`attachment-${name}`),
          filename: `${name}.pdf`,
          storageKey: key,
          mimeType: "application/pdf",
          size,
        },
      },
    },
  });
  return key;
}

async function createFileUrlOnlyMaterial(name: string, fileUrl: string) {
  const scheduledClassId = id(`class-file-url-${name}`);
  const materialId = id(`material-file-url-${name}`);
  await prisma.scheduledClass.create({
    data: {
      id: scheduledClassId,
      title: `File URL class ${name}`,
      startAt: new Date("2026-07-16T09:00:00.000Z"),
      endAt: new Date("2026-07-16T10:00:00.000Z"),
      teacherId: ownerId,
    },
  });
  await prisma.courseMaterial.create({
    data: {
      id: materialId,
      title: `File URL material ${name}`,
      fileUrl,
      scheduledClassId,
      teacherId: ownerId,
    },
  });
  return materialId;
}

suite("pending upload PostgreSQL durable lifecycle", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
    await createOwnerUsers();
  });

  afterEach(async () => {
    await cleanupFixtures();
    await createOwnerUsers();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("recovers a stale claim but leaves a fresh lease untouched", async () => {
    const staleKey = storageKey("stale-claim");
    const freshKey = storageKey("fresh-claim");
    const now = new Date();
    await prisma.pendingUpload.createMany({
      data: [
        pendingData("stale-claim", {
          claimToken: "dead-worker",
          claimedAt: new Date(now.getTime() - 60 * 60 * 1000),
        }),
        pendingData("fresh-claim", {
          claimToken: "live-worker",
          claimedAt: now,
        }),
      ],
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await expect(sweepExpiredPendingUploads({ storage, now, limit: 10 })).resolves.toEqual(
      expect.objectContaining({ claimed: 1, deleted: 1, durabilityFailures: 0 }),
    );
    expect(storage.delete).toHaveBeenCalledWith(staleKey);
    expect(storage.delete).not.toHaveBeenCalledWith(freshKey);
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: staleKey } }),
    ).resolves.toBeNull();
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: freshKey } }),
    ).resolves.toEqual(expect.objectContaining({ claimToken: "live-worker" }));
  });

  it("retains the same row through repeated storage outages and counts it at the cap", async () => {
    const candidate = await prisma.pendingUpload.create({
      data: pendingData("repeated-outage"),
    });
    const storage = { delete: vi.fn().mockRejectedValue(new Error("offline storage")) };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(sweepExpiredPendingUploads({ storage, limit: 1 })).resolves.toEqual(
        expect.objectContaining({
          claimed: 1,
          storageFailures: 1,
          released: 1,
          durabilityFailures: 0,
        }),
      );
      await expect(
        prisma.pendingUpload.findUniqueOrThrow({ where: { storageKey: candidate.storageKey } }),
      ).resolves.toEqual(
        expect.objectContaining({ id: candidate.id, claimToken: null, claimedAt: null }),
      );
    }

    await prisma.pendingUpload.createMany({
      data: Array.from({ length: 19 }, (_, index) => pendingData(`outage-${index}`)),
    });
    await expect(reservePendingUpload({ ...upload("blocked-at-21"), storage })).rejects.toThrow(
      PendingUploadError,
    );
    await expect(prisma.pendingUpload.count({ where: { ownerId } })).resolves.toBe(20);
  });

  it("allows the exact twentieth retained object and rejects the twenty-first", async () => {
    await prisma.pendingUpload.createMany({
      data: Array.from({ length: 19 }, (_, index) =>
        pendingData(`boundary-${index}`, {
          claimToken: index % 2 === 0 ? `worker-${index}` : null,
          claimedAt: index % 2 === 0 ? new Date() : null,
        }),
      ),
    });
    const storage = { delete: vi.fn().mockRejectedValue(new Error("offline storage")) };

    await expect(reservePendingUpload({ ...upload("boundary-20"), storage })).resolves.toEqual(
      expect.objectContaining({ storageKey: storageKey("boundary-20") }),
    );
    await expect(reservePendingUpload({ ...upload("boundary-21"), storage })).rejects.toThrow(
      PendingUploadError,
    );
  });

  it("serializes concurrent reservations at the combined cap and quota boundary", async () => {
    const pendingSize = 128;
    const pendingCount = 19;
    await prisma.pendingUpload.createMany({
      data: Array.from({ length: pendingCount }, (_, index) =>
        pendingData(`race-boundary-${index}`, {
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          byteSize: pendingSize,
        }),
      ),
    });
    await prisma.activeStorageObject.create({
      data: {
        ownerId,
        purpose: "report-pdf",
        storageKey: storageKey("race-ledger"),
        filename: "race-ledger.pdf",
        mimeType: "application/pdf",
        byteSize: MAX_OWNER_ACTIVE_AND_PENDING_BYTES - pendingCount * pendingSize - 1,
      },
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    const results = await Promise.allSettled([
      reservePendingUpload({ ...upload("race-a", 1), storage }),
      reservePendingUpload({ ...upload("race-b", 1), storage }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(prisma.pendingUpload.count({ where: { ownerId } })).resolves.toBe(20);
  });

  it("allows the exact 2 GiB boundary and rejects one byte over without alias double counting", async () => {
    const firstSize = 1024 * 1024 * 1024;
    const secondSize = MAX_OWNER_ACTIVE_AND_PENDING_BYTES - firstSize - 128;
    await createMaterialReference("ledger-duplicate", firstSize);
    const duplicateKey = "uploads/materials/ledger-duplicate.pdf";
    await prisma.courseMaterial.update({
      where: { id: id("material-ledger-duplicate") },
      data: { fileUrl: `/${duplicateKey}` },
    });
    await prisma.attachment.update({
      where: { id: id("attachment-ledger-duplicate") },
      data: { storageKey: `/public/${duplicateKey}` },
    });
    await prisma.activeStorageObject.createMany({
      data: [
        {
          ownerId,
          purpose: "course-material",
          storageKey: duplicateKey,
          filename: "ledger-duplicate.pdf",
          mimeType: "application/pdf",
          byteSize: firstSize,
        },
        {
          ownerId,
          purpose: "report-pdf",
          storageKey: storageKey("ledger-second"),
          filename: "ledger-second.pdf",
          mimeType: "application/pdf",
          byteSize: secondSize,
        },
      ],
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await expect(reservePendingUpload({ ...upload("exact-quota", 128), storage })).resolves.toEqual(
      expect.objectContaining({ storageKey: storageKey("exact-quota") }),
    );
    await expect(reservePendingUpload({ ...upload("over-quota", 1), storage })).rejects.toThrow(
      PendingUploadError,
    );
  });

  it.each([
    ["current", storageUrlForKey(storageKey("file-url-only-current"))],
    ["legacy", "/public/uploads/materials/file-url-only-legacy.pdf"],
  ])("blocks growth for an unledgered attachment-less %s file URL", async (_label, fileUrl) => {
    await createFileUrlOnlyMaterial(`unledgered-${_label}`, fileUrl);

    await expect(reservePendingUpload({ ...upload(`blocked-${_label}`) })).rejects.toThrow(
      PendingUploadError,
    );
  });

  it("deduplicates a legacy attachment-less file URL against its ledger at the exact quota boundary", async () => {
    const legacyKey = "uploads/materials/file-url-boundary.pdf";
    const firstSize = 1024 * 1024 * 1024;
    const secondSize = MAX_OWNER_ACTIVE_AND_PENDING_BYTES - firstSize - 128;
    await createFileUrlOnlyMaterial("legacy-boundary", `/public/${legacyKey}`);
    await prisma.activeStorageObject.createMany({
      data: [
        {
          ownerId,
          purpose: "course-material",
          storageKey: legacyKey,
          filename: "file-url-boundary.pdf",
          mimeType: "application/pdf",
          byteSize: firstSize,
        },
        {
          ownerId,
          purpose: "report-pdf",
          storageKey: storageKey("file-url-boundary-second"),
          filename: "file-url-boundary-second.pdf",
          mimeType: "application/pdf",
          byteSize: secondSize,
        },
      ],
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await expect(
      reservePendingUpload({ ...upload("file-url-boundary", 128), storage }),
    ).resolves.toEqual(expect.objectContaining({ storageKey: storageKey("file-url-boundary") }));
    await expect(
      reservePendingUpload({ ...upload("file-url-boundary-over", 1), storage }),
    ).rejects.toThrow(PendingUploadError);
  });

  it("queues an attachment-less current file URL after replacement", async () => {
    const key = storageKey("file-url-replace");
    const materialId = await createFileUrlOnlyMaterial("replace", storageUrlForKey(key));

    await prisma.$transaction(
      (transaction) =>
        updateCourseMaterialForTeacher(
          materialId,
          ownerId,
          { fileUrl: "https://cdn.example.com/replacement.pdf" },
          transaction,
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await expect(prisma.pendingUpload.findUnique({ where: { storageKey: key } })).resolves.toEqual(
      expect.objectContaining({ ownerId, purpose: "course-material" }),
    );
  });

  it("queues an attachment-less legacy file URL on delete but retains a shared reference", async () => {
    const legacyKey = "uploads/materials/file-url-shared.pdf";
    const firstMaterialId = await createFileUrlOnlyMaterial("shared-first", `/${legacyKey}`);
    await createFileUrlOnlyMaterial("shared-second", `/public/${legacyKey}`);

    await prisma.$transaction(
      (transaction) => deleteCourseMaterialForTeacher(firstMaterialId, ownerId, transaction),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: legacyKey } }),
    ).resolves.toBeNull();

    const secondMaterial = await prisma.courseMaterial.findFirstOrThrow({
      where: { id: id("material-file-url-shared-second") },
      select: { id: true },
    });
    await prisma.$transaction(
      (transaction) => deleteCourseMaterialForTeacher(secondMaterial.id, ownerId, transaction),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: legacyKey } }),
    ).resolves.toEqual(expect.objectContaining({ ownerId, purpose: "course-material" }));
  });

  it("finalizes exact metadata into active accounting in the caller transaction", async () => {
    const candidate = upload("atomic-finalize");
    await prisma.pendingUpload.create({
      data: { ...candidate, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await prisma.$transaction(
      async (transaction) => {
        await finalizePendingUploads(
          {
            ownerId,
            purpose: "course-material",
            uploads: [candidate],
          },
          transaction,
        );
        const scheduledClass = await transaction.scheduledClass.create({
          data: {
            id: id("class-atomic-finalize"),
            title: "Atomic finalize class",
            startAt: new Date("2026-07-16T09:00:00.000Z"),
            endAt: new Date("2026-07-16T10:00:00.000Z"),
            teacherId: ownerId,
          },
        });
        await transaction.courseMaterial.create({
          data: {
            id: id("material-atomic-finalize"),
            title: "Atomic finalized material",
            fileUrl: storageUrlForKey(candidate.storageKey),
            scheduledClassId: scheduledClass.id,
            teacherId: ownerId,
            attachments: {
              create: {
                id: id("attachment-atomic-finalize"),
                filename: candidate.filename,
                storageKey: candidate.storageKey,
                mimeType: candidate.mimeType,
                size: candidate.byteSize,
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: candidate.storageKey } }),
    ).resolves.toBeNull();
    await expect(
      prisma.activeStorageObject.findUnique({ where: { storageKey: candidate.storageKey } }),
    ).resolves.toEqual(
      expect.objectContaining({
        ownerId,
        purpose: "course-material",
        filename: candidate.filename,
        mimeType: candidate.mimeType,
        byteSize: candidate.byteSize,
      }),
    );
  });

  it("finalizes report and teacher-photo reservations into owner-wide active accounting", async () => {
    const report = {
      ownerId: adminOwnerId,
      purpose: "report-pdf" as const,
      storageKey: `private/teachers/${adminOwnerId}/reports/report.pdf`,
      filename: "report.pdf",
      mimeType: "application/pdf",
      byteSize: 256,
    };
    const photo = {
      ownerId: adminOwnerId,
      purpose: "teacher-photo" as const,
      storageKey: `public/teachers/${adminOwnerId}/photo.webp`,
      filename: "photo.webp",
      mimeType: "image/webp",
      byteSize: 512,
    };
    await prisma.pendingUpload.createMany({
      data: [report, photo].map((candidate) => ({
        ...candidate,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })),
    });

    await prisma.$transaction(
      async (transaction) => {
        await finalizePendingUploads(
          { ownerId: adminOwnerId, purpose: "report-pdf", uploads: [report] },
          transaction,
        );
        await finalizePendingUploads(
          { ownerId: adminOwnerId, purpose: "teacher-photo", uploads: [photo] },
          transaction,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await expect(
      prisma.activeStorageObject.findMany({
        where: { ownerId: adminOwnerId },
        orderBy: { byteSize: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        purpose: "report-pdf",
        storageKey: report.storageKey,
        byteSize: 256,
      }),
      expect.objectContaining({
        purpose: "teacher-photo",
        storageKey: photo.storageKey,
        byteSize: 512,
      }),
    ]);
    await expect(prisma.pendingUpload.count({ where: { ownerId: adminOwnerId } })).resolves.toBe(0);
  });

  it("atomically moves an unreferenced material ledger row back to pending cleanup", async () => {
    const key = await createMaterialReference("active-to-pending", 640);
    await prisma.activeStorageObject.create({
      data: {
        ownerId,
        purpose: "course-material",
        storageKey: key,
        filename: "active-to-pending.pdf",
        mimeType: "application/pdf",
        byteSize: 640,
      },
    });

    await prisma.$transaction(
      async (transaction) => {
        await transaction.courseMaterial.delete({
          where: { id: id("material-active-to-pending") },
        });
        await queueStorageObjectForDeletion(
          {
            ownerId,
            purpose: "course-material",
            storageKey: key,
            filename: "fallback.pdf",
            mimeType: "application/octet-stream",
            byteSize: 1,
          },
          transaction,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await expect(
      prisma.activeStorageObject.findUnique({ where: { storageKey: key } }),
    ).resolves.toBeNull();
    await expect(prisma.pendingUpload.findUnique({ where: { storageKey: key } })).resolves.toEqual(
      expect.objectContaining({
        ownerId,
        purpose: "course-material",
        filename: "active-to-pending.pdf",
        mimeType: "application/pdf",
        byteSize: 640,
        claimToken: null,
      }),
    );
  });

  it("converts a referenced expired reservation to active accounting without deleting storage", async () => {
    const key = await createMaterialReference("referenced-expired");
    await prisma.pendingUpload.create({
      data: pendingData("referenced-expired"),
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await expect(sweepExpiredPendingUploads({ storage, limit: 1 })).resolves.toEqual(
      expect.objectContaining({ claimed: 1, referenced: 1, deleted: 0 }),
    );
    expect(storage.delete).not.toHaveBeenCalledWith(key);
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: key } }),
    ).resolves.toBeNull();
    await expect(
      prisma.activeStorageObject.findUnique({ where: { storageKey: key } }),
    ).resolves.toEqual(expect.objectContaining({ ownerId, byteSize: 128 }));
  });

  it("still gives finalization and expiry sweep one winner", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30_000);
    const candidate = upload("finalize-sweep");
    await prisma.pendingUpload.create({ data: { ...candidate, expiresAt } });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    const finalize = prisma
      .$transaction(
        (transaction) =>
          finalizePendingUploads(
            {
              ownerId,
              purpose: "course-material",
              uploads: [candidate],
              now,
            },
            transaction,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .then(() => "finalized" as const)
      .catch(() => "rejected" as const);
    const sweep = sweepExpiredPendingUploads({ storage, now: expiresAt, limit: 1 }).then(
      (result) => (result.claimed === 1 ? ("swept" as const) : ("skipped" as const)),
    );

    const [finalizeResult, sweepResult] = await Promise.all([finalize, sweep]);

    expect(
      [finalizeResult, sweepResult].filter(
        (result) => result === "finalized" || result === "swept",
      ),
    ).toHaveLength(1);
    await expect(
      prisma.pendingUpload.count({ where: { storageKey: candidate.storageKey } }),
    ).resolves.toBe(0);
  });
});
