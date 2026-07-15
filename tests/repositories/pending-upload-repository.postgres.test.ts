import { Prisma, UserRole } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  MAX_OWNER_ACTIVE_AND_PENDING_BYTES,
  PendingUploadError,
  finalizePendingUploads,
  releasePendingUpload,
  reservePendingUpload,
  sweepExpiredPendingUploads,
} from "@/lib/repositories/pending-upload-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const runPostgres = process.env.RUN_TASK3_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (name: string) => `t3-pending-${runId}-${name}`;
const ownerId = id("teacher");
const otherOwnerId = id("other-teacher");

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

async function cleanupFixtures() {
  const fixtureIds = { startsWith: `t3-pending-${runId}-` };
  await prisma.pendingUpload.deleteMany({ where: { ownerId: { in: [ownerId, otherOwnerId] } } });
  await prisma.courseMaterial.deleteMany({ where: { id: fixtureIds } });
  await prisma.scheduledClass.deleteMany({ where: { id: fixtureIds } });
  await prisma.appUser.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
}

suite("pending upload PostgreSQL lifecycle", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
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
      ],
    });
  });

  afterEach(async () => {
    await cleanupFixtures();
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
      ],
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("sweeps an owner expired object before reserving a replacement", async () => {
    const oldKey = storageKey("expired");
    await prisma.pendingUpload.create({
      data: {
        ownerId,
        purpose: "course-material",
        storageKey: oldKey,
        filename: "expired.pdf",
        mimeType: "application/pdf",
        byteSize: 128,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await reservePendingUpload({ ...upload("replacement"), storage });

    expect(storage.delete).toHaveBeenCalledWith(oldKey);
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: oldKey } }),
    ).resolves.toBeNull();
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: storageKey("replacement") } }),
    ).resolves.toEqual(expect.objectContaining({ ownerId, purpose: "course-material" }));
  });

  it("rejects an active-plus-pending owner quota overflow without double counting storage keys", async () => {
    const scheduledClassId = id("class");
    const activeKey = storageKey("active-near-limit");
    await prisma.scheduledClass.create({
      data: {
        id: scheduledClassId,
        title: "Quota fixture class",
        startAt: new Date("2026-07-15T09:00:00.000Z"),
        endAt: new Date("2026-07-15T10:00:00.000Z"),
        teacherId: ownerId,
      },
    });
    await prisma.courseMaterial.create({
      data: {
        id: id("material"),
        title: "Quota fixture material",
        fileUrl: storageUrlForKey(activeKey),
        scheduledClassId,
        teacherId: ownerId,
        attachments: {
          create: {
            id: id("attachment"),
            filename: "active-near-limit.pdf",
            storageKey: activeKey,
            mimeType: "application/pdf",
            size: MAX_OWNER_ACTIVE_AND_PENDING_BYTES - 128,
          },
        },
      },
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await expect(reservePendingUpload({ ...upload("over-quota", 256), storage })).rejects.toThrow(
      PendingUploadError,
    );
    await expect(prisma.pendingUpload.count({ where: { ownerId } })).resolves.toBe(0);
  });

  it("allows only one concurrent reservation for the final available outstanding slot", async () => {
    await prisma.pendingUpload.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        ...upload(`existing-${index}`),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })),
    });
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    const results = await Promise.allSettled([
      reservePendingUpload({ ...upload("race-a"), storage }),
      reservePendingUpload({ ...upload("race-b"), storage }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(prisma.pendingUpload.count({ where: { ownerId } })).resolves.toBe(20);
  });

  it("gives finalization and expiry sweep one database winner", async () => {
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

  it("recreates an immediately expired reservation after a claimed storage delete fails", async () => {
    const candidate = upload("retry");
    await prisma.pendingUpload.create({
      data: { ...candidate, expiresAt: new Date(Date.now() - 1_000) },
    });
    const storage = { delete: vi.fn().mockRejectedValue(new Error("offline storage")) };

    await expect(sweepExpiredPendingUploads({ storage, limit: 1 })).resolves.toEqual(
      expect.objectContaining({ claimed: 1, deleteFailures: 1, retried: 1 }),
    );
    await expect(
      prisma.pendingUpload.findUniqueOrThrow({ where: { storageKey: candidate.storageKey } }),
    ).resolves.toEqual(expect.objectContaining({ expiresAt: expect.any(Date) }));
  });

  it("allows cancellation only by the reservation owner", async () => {
    const candidate = upload("cancel");
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };

    await reservePendingUpload({ ...candidate, storage });
    await expect(
      releasePendingUpload({
        ownerId: otherOwnerId,
        storageKey: candidate.storageKey,
        storage,
      }),
    ).resolves.toEqual({ claimed: false, deleted: false, referenced: false, retried: false });
    expect(storage.delete).not.toHaveBeenCalled();
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: candidate.storageKey } }),
    ).resolves.not.toBeNull();

    await expect(
      releasePendingUpload({ ownerId, storageKey: candidate.storageKey, storage }),
    ).resolves.toEqual({ claimed: true, deleted: true, referenced: false, retried: false });
    expect(storage.delete).toHaveBeenCalledWith(candidate.storageKey);
    await expect(
      prisma.pendingUpload.findUnique({ where: { storageKey: candidate.storageKey } }),
    ).resolves.toBeNull();
  });
});
