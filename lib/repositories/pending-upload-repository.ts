import { randomUUID } from "node:crypto";

import { type PendingUpload, Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStorageObjectReferenceStatus } from "@/lib/repositories/storage-reference-repository";
import type { StorageService } from "@/lib/storage/StorageService";
import {
  isTeacherMaterialStorageKey,
  publicTeacherPhotoNamespace,
  sanitizeStorageFilename,
  teacherReportNamespace,
  validateLegacyStorageKey,
  validateStorageKey,
} from "@/lib/storage/storage-key";
import { normalizePersistedStorageReference } from "@/lib/storage/storage-url";

export const PENDING_UPLOAD_EXPIRY_MS = 60 * 60 * 1000;
export const PENDING_UPLOAD_CLAIM_LEASE_MS = 5 * 60 * 1000;
export const MAX_OUTSTANDING_PENDING_UPLOADS = 20;
export const MAX_OWNER_ACTIVE_AND_PENDING_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_PENDING_UPLOAD_REQUESTS_PER_MINUTE = 30;
export const MAX_PENDING_UPLOAD_RATE_LIMIT_OWNERS = 1_000;
export const DEFAULT_PENDING_UPLOAD_SWEEP_LIMIT = 25;
export const CONSERVATIVE_UNLEDGERED_STORAGE_BYTES = 2_147_483_647;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export type PendingUploadPurpose = "course-material" | "report-pdf" | "teacher-photo";
export type PendingUploadStorage = Pick<StorageService, "delete">;
export type PendingUploadDatabase = typeof prisma | Prisma.TransactionClient;

export type PendingUploadMetadata = {
  byteSize: number;
  filename: string;
  mimeType: string;
  storageKey: string;
};

export class PendingUploadError extends Error {
  constructor() {
    super("Uploaded file is no longer available.");
    this.name = "PendingUploadError";
  }
}

type PendingUploadRow = Pick<
  PendingUpload,
  | "byteSize"
  | "claimedAt"
  | "claimToken"
  | "createdAt"
  | "expiresAt"
  | "filename"
  | "id"
  | "mimeType"
  | "ownerId"
  | "purpose"
  | "storageKey"
>;

type ClaimedPendingUpload = PendingUploadRow & {
  claimedAt: Date;
  claimToken: string;
};

type CleanupResult = {
  deleted: boolean;
  durabilityFailure: boolean;
  lookupFailed: boolean;
  referenced: boolean;
  released: boolean;
  storageFailed: boolean;
};

function pendingUploadError() {
  return new PendingUploadError();
}

function assertOwnerId(ownerId: string) {
  if (
    typeof ownerId !== "string" ||
    !ownerId ||
    ownerId.length > 191 ||
    ownerId !== ownerId.trim()
  ) {
    throw pendingUploadError();
  }
  return ownerId;
}

function assertPurpose(value: string): asserts value is PendingUploadPurpose {
  if (value !== "course-material" && value !== "teacher-photo" && value !== "report-pdf") {
    throw pendingUploadError();
  }
}

function directTeacherPhotoOwnerId(storageKey: string) {
  try {
    const [root, collection, ownerId, filename, ...extraSegments] =
      validateStorageKey(storageKey).split("/");
    if (
      root !== "public" ||
      collection !== "teachers" ||
      !ownerId ||
      !filename ||
      extraSegments.length > 0
    ) {
      return null;
    }
    publicTeacherPhotoNamespace(ownerId);
    return ownerId;
  } catch {
    return null;
  }
}

function isDirectTeacherPhotoKey(storageKey: string, ownerId: string) {
  return directTeacherPhotoOwnerId(storageKey) === ownerId;
}

function assertMetadata(
  ownerId: string,
  purpose: PendingUploadPurpose,
  metadata: PendingUploadMetadata,
) {
  try {
    const storageKey = validateStorageKey(metadata.storageKey);
    const filename = sanitizeStorageFilename(metadata.filename);
    if (
      filename !== metadata.filename ||
      typeof metadata.mimeType !== "string" ||
      !metadata.mimeType
    ) {
      throw new Error("Invalid upload metadata");
    }
    if (!Number.isSafeInteger(metadata.byteSize) || metadata.byteSize <= 0) {
      throw new Error("Invalid upload size");
    }

    const owned =
      purpose === "course-material"
        ? isTeacherMaterialStorageKey(storageKey, ownerId)
        : purpose === "teacher-photo"
          ? isDirectTeacherPhotoKey(storageKey, ownerId)
          : storageKey.startsWith(`${teacherReportNamespace(ownerId)}/`);
    if (!owned) throw new Error("Invalid upload owner");

    return {
      byteSize: metadata.byteSize,
      filename,
      mimeType: metadata.mimeType,
      storageKey,
    };
  } catch {
    throw pendingUploadError();
  }
}

function isRootDatabase(database: PendingUploadDatabase): database is typeof prisma {
  return database === prisma;
}

function assertTransactionClient(
  database: Prisma.TransactionClient,
): asserts database is Prisma.TransactionClient {
  if (
    !database ||
    typeof database !== "object" ||
    "$transaction" in (database as unknown as Record<string, unknown>)
  ) {
    throw pendingUploadError();
  }
}

function isSerializableTransactionConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function inSerializableTransaction<T>(
  database: PendingUploadDatabase,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  if (isRootDatabase(database)) {
    return prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
  return callback(database);
}

function normalizedStorageKey(storageKey: string) {
  return normalizePersistedStorageReference(storageKey)?.storageKey ?? storageKey;
}

type PersistedReferenceClassification =
  | { kind: "managed"; storageKey: string }
  | { kind: "non-storage" }
  | { kind: "uncertain" };

function isStorageLookingValue(value: string) {
  const candidate = value.startsWith("/") ? value.slice(1) : value;
  return (
    candidate === "api" ||
    candidate.startsWith("api/") ||
    candidate === "uploads" ||
    candidate.startsWith("uploads/") ||
    candidate === "public/uploads" ||
    candidate.startsWith("public/uploads/") ||
    candidate === "private" ||
    candidate.startsWith("private/") ||
    candidate === "public" ||
    candidate.startsWith("public/")
  );
}

function classifyPersistedReference(value: unknown): PersistedReferenceClassification {
  const reference = normalizePersistedStorageReference(value);
  if (reference) return { kind: "managed", storageKey: reference.storageKey };
  if (typeof value !== "string" || !value || value !== value.trim()) return { kind: "uncertain" };

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return { kind: "non-storage" };
  } catch {
    // Root-static references are handled below. Other invalid values remain fail-closed.
  }

  if (value.startsWith("/") && !value.startsWith("//") && !isStorageLookingValue(value)) {
    return { kind: "non-storage" };
  }
  return { kind: "uncertain" };
}

function addStorageObject(objects: Map<string, number>, storageKey: string, byteSize: number) {
  const normalizedKey = normalizedStorageKey(storageKey);
  const existingSize = objects.get(normalizedKey);
  if (existingSize === undefined || byteSize > existingSize) {
    objects.set(normalizedKey, byteSize);
  }
}

function totalStorageBytes(objects: Map<string, number>) {
  let total = 0;
  for (const byteSize of objects.values()) {
    total += byteSize;
    if (!Number.isSafeInteger(total)) throw pendingUploadError();
  }
  return total;
}

async function ownerStorageAccounting(ownerId: string, transaction: Prisma.TransactionClient) {
  const owner = await transaction.appUser.findUnique({
    where: { id: ownerId },
    select: { role: true },
  });
  if (!owner) throw pendingUploadError();

  const [pendingUploads, activeObjects, activeAttachments, materialReferences, reportReferences] =
    await Promise.all([
      transaction.pendingUpload.findMany({
        where: { ownerId },
        select: { storageKey: true, byteSize: true },
      }),
      transaction.activeStorageObject.findMany({
        where: { ownerId },
        select: { storageKey: true, byteSize: true },
      }),
      transaction.attachment.findMany({
        where: { courseMaterial: { is: { teacherId: ownerId } } },
        select: { storageKey: true, size: true },
      }),
      transaction.courseMaterial.findMany({
        where: { teacherId: ownerId },
        select: { fileUrl: true },
      }),
      transaction.reportSnapshot.findMany({
        where: { generatedByTeacherId: ownerId, pdfStorageKey: { not: null } },
        select: { pdfStorageKey: true },
      }),
    ]);
  const photoReferences =
    owner.role === UserRole.ADMIN
      ? await transaction.teacher.findMany({
          where: { photoUrl: { not: null } },
          select: { photoUrl: true },
        })
      : [];

  const objects = new Map<string, number>();
  for (const activeObject of activeObjects) {
    addStorageObject(objects, activeObject.storageKey, activeObject.byteSize);
  }
  for (const attachment of activeAttachments) {
    addStorageObject(objects, attachment.storageKey, attachment.size);
  }
  for (const pendingUpload of pendingUploads) {
    addStorageObject(objects, pendingUpload.storageKey, pendingUpload.byteSize);
  }

  let hasUnledgeredReference = false;
  for (const material of materialReferences) {
    const reference = classifyPersistedReference(material.fileUrl);
    if (reference.kind === "non-storage") continue;
    if (reference.kind !== "managed" || !objects.has(reference.storageKey)) {
      hasUnledgeredReference = true;
      break;
    }
  }

  if (!hasUnledgeredReference) {
    for (const report of reportReferences) {
      const reference = classifyPersistedReference(report.pdfStorageKey);
      if (reference.kind === "non-storage") continue;
      if (reference.kind !== "managed" || !objects.has(reference.storageKey)) {
        hasUnledgeredReference = true;
        break;
      }
    }
  }

  if (!hasUnledgeredReference) {
    for (const teacher of photoReferences) {
      const reference = classifyPersistedReference(teacher.photoUrl);
      if (reference.kind === "non-storage") continue;
      if (reference.kind !== "managed") {
        hasUnledgeredReference = true;
        break;
      }
      const photoOwnerId = directTeacherPhotoOwnerId(reference.storageKey);
      if (!photoOwnerId) {
        hasUnledgeredReference = true;
        break;
      }
      if (photoOwnerId !== ownerId) continue;
      if (objects.has(reference.storageKey)) continue;
      hasUnledgeredReference = true;
      break;
    }
  }

  return {
    hasUnledgeredReference,
    objects,
    pendingCount: pendingUploads.length,
    totalBytes: totalStorageBytes(objects),
  };
}

function claimAvailability(staleBefore: Date) {
  return {
    OR: [{ claimToken: null }, { claimedAt: null }, { claimedAt: { lte: staleBefore } }],
  };
}

async function claimPendingUpload(
  input: {
    expiresAtOrBefore?: Date;
    now: Date;
    ownerId?: string;
    storageKey: string;
  },
  database: PendingUploadDatabase,
) {
  const staleBefore = new Date(input.now.getTime() - PENDING_UPLOAD_CLAIM_LEASE_MS);
  const available = claimAvailability(staleBefore);
  const claimToken = randomUUID();

  try {
    return await inSerializableTransaction(database, async (transaction) => {
      const where = {
        storageKey: input.storageKey,
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.expiresAtOrBefore ? { expiresAt: { lte: input.expiresAtOrBefore } } : {}),
        ...available,
      };
      const pendingUpload = await transaction.pendingUpload.findFirst({ where });
      if (!pendingUpload) return null;

      const updated = await transaction.pendingUpload.updateMany({
        where: {
          id: pendingUpload.id,
          storageKey: input.storageKey,
          ...(input.ownerId ? { ownerId: input.ownerId } : {}),
          ...(input.expiresAtOrBefore ? { expiresAt: { lte: input.expiresAtOrBefore } } : {}),
          ...available,
        },
        data: { claimToken, claimedAt: input.now },
      });
      if (updated.count !== 1) return null;
      return {
        ...(pendingUpload as PendingUploadRow),
        claimToken,
        claimedAt: input.now,
      } satisfies ClaimedPendingUpload;
    });
  } catch (error) {
    if (isSerializableTransactionConflict(error)) return null;
    throw error;
  }
}

async function releaseClaim(pendingUpload: ClaimedPendingUpload, database: PendingUploadDatabase) {
  try {
    const released = await database.pendingUpload.updateMany({
      where: { id: pendingUpload.id, claimToken: pendingUpload.claimToken },
      data: { claimToken: null, claimedAt: null },
    });
    return released.count === 1;
  } catch {
    return false;
  }
}

function activeStorageData(pendingUpload: PendingUploadRow) {
  assertPurpose(pendingUpload.purpose);
  return {
    ownerId: pendingUpload.ownerId,
    purpose: pendingUpload.purpose,
    storageKey: pendingUpload.storageKey,
    filename: pendingUpload.filename,
    mimeType: pendingUpload.mimeType,
    byteSize: pendingUpload.byteSize,
  };
}

async function ensureActiveStorageObject(
  pendingUpload: PendingUploadRow,
  transaction: Prisma.TransactionClient,
) {
  const data = activeStorageData(pendingUpload);
  const existing = await transaction.activeStorageObject.findUnique({
    where: { storageKey: pendingUpload.storageKey },
  });
  if (existing) {
    if (
      existing.ownerId !== data.ownerId ||
      existing.purpose !== data.purpose ||
      existing.storageKey !== data.storageKey ||
      existing.filename !== data.filename ||
      existing.mimeType !== data.mimeType ||
      existing.byteSize !== data.byteSize
    ) {
      throw pendingUploadError();
    }
    return existing;
  }
  return transaction.activeStorageObject.create({ data });
}

async function finalizeReferencedClaim(
  pendingUpload: ClaimedPendingUpload,
  database: PendingUploadDatabase,
) {
  await inSerializableTransaction(database, async (transaction) => {
    await ensureActiveStorageObject(pendingUpload, transaction);
    const deleted = await transaction.pendingUpload.deleteMany({
      where: { id: pendingUpload.id, claimToken: pendingUpload.claimToken },
    });
    if (deleted.count !== 1) throw pendingUploadError();
  });
}

async function deleteUnreferencedClaim(
  pendingUpload: ClaimedPendingUpload,
  storage: PendingUploadStorage,
  database: PendingUploadDatabase,
): Promise<CleanupResult> {
  try {
    await storage.delete(pendingUpload.storageKey);
  } catch {
    const released = await releaseClaim(pendingUpload, database);
    return {
      deleted: false,
      durabilityFailure: !released,
      lookupFailed: false,
      referenced: false,
      released,
      storageFailed: true,
    };
  }

  try {
    const deleted = await database.pendingUpload.deleteMany({
      where: { id: pendingUpload.id, claimToken: pendingUpload.claimToken },
    });
    return {
      deleted: deleted.count === 1,
      durabilityFailure: deleted.count !== 1,
      lookupFailed: false,
      referenced: false,
      released: false,
      storageFailed: false,
    };
  } catch {
    return {
      deleted: false,
      durabilityFailure: true,
      lookupFailed: false,
      referenced: false,
      released: false,
      storageFailed: false,
    };
  }
}

async function processClaimedPendingUpload(
  pendingUpload: ClaimedPendingUpload,
  storage: PendingUploadStorage,
  database: PendingUploadDatabase,
): Promise<CleanupResult> {
  let referenceStatus: Awaited<ReturnType<typeof getStorageObjectReferenceStatus>>;
  try {
    referenceStatus = await getStorageObjectReferenceStatus(pendingUpload.storageKey, database);
  } catch {
    referenceStatus = "unknown";
  }

  if (referenceStatus === "unknown") {
    const released = await releaseClaim(pendingUpload, database);
    return {
      deleted: false,
      durabilityFailure: !released,
      lookupFailed: true,
      referenced: false,
      released,
      storageFailed: false,
    };
  }

  if (referenceStatus === "referenced") {
    try {
      await finalizeReferencedClaim(pendingUpload, database);
      return {
        deleted: false,
        durabilityFailure: false,
        lookupFailed: false,
        referenced: true,
        released: false,
        storageFailed: false,
      };
    } catch {
      const released = await releaseClaim(pendingUpload, database);
      return {
        deleted: false,
        durabilityFailure: true,
        lookupFailed: false,
        referenced: false,
        released,
        storageFailed: false,
      };
    }
  }

  return deleteUnreferencedClaim(pendingUpload, storage, database);
}

function createPendingUploadRequestRateLimiter(
  options: {
    maxOwners?: number;
    maxRequests?: number;
    windowMs?: number;
  } = {},
) {
  const maxOwners = options.maxOwners ?? MAX_PENDING_UPLOAD_RATE_LIMIT_OWNERS;
  const maxRequests = options.maxRequests ?? MAX_PENDING_UPLOAD_REQUESTS_PER_MINUTE;
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  if (
    !Number.isSafeInteger(maxOwners) ||
    maxOwners < 1 ||
    !Number.isSafeInteger(maxRequests) ||
    maxRequests < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1
  ) {
    throw pendingUploadError();
  }

  const requestWindows = new Map<string, number[]>();

  function activeRequests(requests: number[], cutoff: number) {
    return requests.filter((timestamp) => timestamp > cutoff);
  }

  function evictDormantOwners(cutoff: number) {
    for (const [ownerId, requests] of requestWindows) {
      const active = activeRequests(requests, cutoff);
      if (active.length === 0) {
        requestWindows.delete(ownerId);
      } else if (active.length !== requests.length) {
        requestWindows.set(ownerId, active);
      }
    }
  }

  function consume(ownerId: string, now = new Date()) {
    const validOwnerId = assertOwnerId(ownerId);
    const currentTime = now.getTime();
    if (!Number.isFinite(currentTime)) throw pendingUploadError();
    const cutoff = currentTime - windowMs;
    evictDormantOwners(cutoff);

    const requests = activeRequests(requestWindows.get(validOwnerId) ?? [], cutoff);
    if (!requestWindows.has(validOwnerId) && requestWindows.size >= maxOwners) {
      const leastRecentlyUsedOwner = requestWindows.keys().next().value;
      if (typeof leastRecentlyUsedOwner === "string") {
        requestWindows.delete(leastRecentlyUsedOwner);
      }
    }

    requestWindows.delete(validOwnerId);
    requestWindows.set(validOwnerId, requests);
    if (requests.length >= maxRequests) throw pendingUploadError();
    requests.push(currentTime);
  }

  return {
    consume,
    reset() {
      requestWindows.clear();
    },
  };
}

const pendingUploadRequestRateLimiter = createPendingUploadRequestRateLimiter();

export function consumePendingUploadRequestRateLimit(ownerId: string, now = new Date()) {
  pendingUploadRequestRateLimiter.consume(ownerId, now);
}

async function finalizePendingUploadsUnchecked(
  input: {
    ownerId: string;
    purpose: PendingUploadPurpose;
    uploads: PendingUploadMetadata[];
    now?: Date;
  },
  database: Prisma.TransactionClient,
) {
  assertTransactionClient(database);
  const ownerId = assertOwnerId(input.ownerId);
  assertPurpose(input.purpose);
  if (!Array.isArray(input.uploads) || input.uploads.length === 0) return;

  const uploads = input.uploads.map((upload) => assertMetadata(ownerId, input.purpose, upload));
  const storageKeys = uploads.map((upload) => upload.storageKey);
  if (new Set(storageKeys).size !== storageKeys.length) throw pendingUploadError();

  const now = input.now ?? new Date();
  const rows = await database.pendingUpload.findMany({
    where: {
      ownerId,
      purpose: input.purpose,
      storageKey: { in: storageKeys },
      expiresAt: { gt: now },
      claimToken: null,
    },
  });
  if (rows.length !== uploads.length) throw pendingUploadError();

  const byStorageKey = new Map(rows.map((row) => [row.storageKey, row]));
  for (const upload of uploads) {
    const pendingUpload = byStorageKey.get(upload.storageKey);
    if (
      !pendingUpload ||
      pendingUpload.ownerId !== ownerId ||
      pendingUpload.purpose !== input.purpose ||
      pendingUpload.expiresAt <= now ||
      pendingUpload.claimToken !== null ||
      pendingUpload.filename !== upload.filename ||
      pendingUpload.mimeType !== upload.mimeType ||
      pendingUpload.byteSize !== upload.byteSize
    ) {
      throw pendingUploadError();
    }
  }

  for (const row of rows) {
    await ensureActiveStorageObject(row, database);
  }
  const deleted = await database.pendingUpload.deleteMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      ownerId,
      purpose: input.purpose,
      expiresAt: { gt: now },
      claimToken: null,
    },
  });
  if (deleted.count !== uploads.length) throw pendingUploadError();
}

async function finalizePendingUploads(
  input: {
    ownerId: string;
    purpose: PendingUploadPurpose;
    uploads: PendingUploadMetadata[];
    now?: Date;
  },
  database: Prisma.TransactionClient,
) {
  try {
    return await finalizePendingUploadsUnchecked(input, database);
  } catch {
    throw pendingUploadError();
  }
}

async function queueStorageObjectForDeletionUnchecked(
  input: {
    ownerId: string;
    purpose: PendingUploadPurpose;
    storageKey: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    now?: Date;
  },
  database: Prisma.TransactionClient,
) {
  assertTransactionClient(database);
  const fallbackOwnerId = assertOwnerId(input.ownerId);
  assertPurpose(input.purpose);

  let storageKey: string;
  let filename: string;
  try {
    const reference = normalizePersistedStorageReference(input.storageKey);
    if (!reference) throw new Error("Invalid cleanup storage key");
    storageKey =
      reference.kind === "legacy"
        ? validateLegacyStorageKey(reference.storageKey)
        : validateStorageKey(reference.storageKey);
    filename = sanitizeStorageFilename(input.filename);
    if (
      filename !== input.filename ||
      typeof input.mimeType !== "string" ||
      !input.mimeType ||
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize <= 0
    ) {
      throw new Error("Invalid cleanup metadata");
    }
  } catch {
    throw pendingUploadError();
  }

  let referenceStatus: Awaited<ReturnType<typeof getStorageObjectReferenceStatus>>;
  try {
    referenceStatus = await getStorageObjectReferenceStatus(storageKey, database);
  } catch {
    referenceStatus = "unknown";
  }
  if (referenceStatus === "unknown") throw pendingUploadError();
  if (referenceStatus === "referenced") return null;

  const [activeObject, existingPendingUpload] = await Promise.all([
    database.activeStorageObject.findUnique({ where: { storageKey } }),
    database.pendingUpload.findUnique({ where: { storageKey } }),
  ]);
  const data = activeObject
    ? {
        ownerId: activeObject.ownerId,
        purpose: activeObject.purpose,
        storageKey,
        filename: activeObject.filename,
        mimeType: activeObject.mimeType,
        byteSize: activeObject.byteSize,
      }
    : {
        ownerId: fallbackOwnerId,
        purpose: input.purpose,
        storageKey,
        filename,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
      };
  assertPurpose(data.purpose);

  if (existingPendingUpload) {
    if (
      existingPendingUpload.ownerId !== data.ownerId ||
      existingPendingUpload.purpose !== data.purpose ||
      existingPendingUpload.storageKey !== data.storageKey ||
      existingPendingUpload.filename !== data.filename ||
      existingPendingUpload.mimeType !== data.mimeType ||
      existingPendingUpload.byteSize !== data.byteSize
    ) {
      throw pendingUploadError();
    }
  } else {
    await database.pendingUpload.create({
      data: {
        ...data,
        expiresAt: input.now ?? new Date(),
      },
    });
  }

  if (activeObject) {
    const deleted = await database.activeStorageObject.deleteMany({
      where: { id: activeObject.id, storageKey },
    });
    if (deleted.count !== 1) throw pendingUploadError();
  }

  return { ownerId: data.ownerId, storageKey };
}

async function queueStorageObjectForDeletion(
  input: {
    ownerId: string;
    purpose: PendingUploadPurpose;
    storageKey: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    now?: Date;
  },
  database: Prisma.TransactionClient,
) {
  try {
    return await queueStorageObjectForDeletionUnchecked(input, database);
  } catch {
    throw pendingUploadError();
  }
}

export async function sweepExpiredPendingUploads(
  input: {
    limit?: number;
    now?: Date;
    ownerId?: string;
    storage: PendingUploadStorage;
  },
  database: PendingUploadDatabase = prisma,
) {
  const now = input.now ?? new Date();
  const ownerId = input.ownerId ? assertOwnerId(input.ownerId) : undefined;
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PENDING_UPLOAD_SWEEP_LIMIT, 100));
  const staleBefore = new Date(now.getTime() - PENDING_UPLOAD_CLAIM_LEASE_MS);
  const candidates = await database.pendingUpload.findMany({
    where: {
      expiresAt: { lte: now },
      ...(ownerId ? { ownerId } : {}),
      ...claimAvailability(staleBefore),
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  const summary = {
    claimed: 0,
    deleted: 0,
    durabilityFailures: 0,
    lookupFailures: 0,
    referenced: 0,
    released: 0,
    skipped: 0,
    storageFailures: 0,
  };

  for (const candidate of candidates) {
    let claimed: ClaimedPendingUpload | null;
    try {
      claimed = await claimPendingUpload(
        {
          storageKey: candidate.storageKey,
          ...(ownerId ? { ownerId } : {}),
          expiresAtOrBefore: now,
          now,
        },
        database,
      );
    } catch {
      summary.durabilityFailures += 1;
      summary.skipped += 1;
      continue;
    }
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    summary.claimed += 1;
    const result = await processClaimedPendingUpload(claimed, input.storage, database);
    if (result.deleted) summary.deleted += 1;
    if (result.durabilityFailure) summary.durabilityFailures += 1;
    if (result.lookupFailed) summary.lookupFailures += 1;
    if (result.referenced) summary.referenced += 1;
    if (result.released) summary.released += 1;
    if (result.storageFailed) summary.storageFailures += 1;
  }
  return summary;
}

export async function reservePendingUpload(
  input: {
    ownerId: string;
    purpose: PendingUploadPurpose;
    storage: PendingUploadStorage;
    now?: Date;
  } & PendingUploadMetadata,
  database: PendingUploadDatabase = prisma,
) {
  const ownerId = assertOwnerId(input.ownerId);
  assertPurpose(input.purpose);
  const metadata = assertMetadata(ownerId, input.purpose, input);
  const now = input.now ?? new Date();

  const sweep = await sweepExpiredPendingUploads(
    { ownerId, storage: input.storage, now },
    database,
  );
  if (sweep.durabilityFailures > 0) throw pendingUploadError();

  return inSerializableTransaction(database, async (transaction) => {
    const accounting = await ownerStorageAccounting(ownerId, transaction);
    if (
      accounting.pendingCount >= MAX_OUTSTANDING_PENDING_UPLOADS ||
      accounting.hasUnledgeredReference
    ) {
      throw pendingUploadError();
    }

    const canonicalStorageKey = normalizedStorageKey(metadata.storageKey);
    if (accounting.objects.has(canonicalStorageKey)) throw pendingUploadError();
    if (accounting.totalBytes + metadata.byteSize > MAX_OWNER_ACTIVE_AND_PENDING_BYTES) {
      throw pendingUploadError();
    }

    return transaction.pendingUpload.create({
      data: {
        ownerId,
        purpose: input.purpose,
        storageKey: metadata.storageKey,
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        byteSize: metadata.byteSize,
        expiresAt: new Date(now.getTime() + PENDING_UPLOAD_EXPIRY_MS),
      },
    });
  });
}

export async function releasePendingUpload(
  input: {
    now?: Date;
    ownerId: string;
    storage: PendingUploadStorage;
    storageKey: string;
  },
  database: PendingUploadDatabase = prisma,
) {
  const ownerId = assertOwnerId(input.ownerId);
  let storageKey: string;
  try {
    const reference = normalizePersistedStorageReference(input.storageKey);
    if (!reference) throw new Error("Invalid pending upload reference");
    storageKey =
      reference.kind === "legacy"
        ? validateLegacyStorageKey(reference.storageKey)
        : validateStorageKey(reference.storageKey);
  } catch {
    return {
      claimed: false,
      deleted: false,
      durabilityFailure: false,
      lookupFailed: false,
      referenced: false,
      released: false,
      storageFailed: false,
    };
  }
  const now = input.now ?? new Date();
  const claimed = await claimPendingUpload({ ownerId, storageKey, now }, database);
  if (!claimed) {
    return {
      claimed: false,
      deleted: false,
      durabilityFailure: false,
      lookupFailed: false,
      referenced: false,
      released: false,
      storageFailed: false,
    };
  }

  const result = await processClaimedPendingUpload(claimed, input.storage, database);
  return { claimed: true, ...result };
}

export {
  createPendingUploadRequestRateLimiter,
  finalizePendingUploads,
  queueStorageObjectForDeletion,
};
