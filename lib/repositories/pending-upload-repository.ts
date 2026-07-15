import { type PendingUpload, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isStorageObjectReferenced } from "@/lib/repositories/storage-reference-repository";
import type { StorageService } from "@/lib/storage/StorageService";
import {
  isTeacherMaterialStorageKey,
  publicTeacherPhotoNamespace,
  sanitizeStorageFilename,
  validateStorageKey,
} from "@/lib/storage/storage-key";
import { normalizePersistedStorageReference } from "@/lib/storage/storage-url";

export const PENDING_UPLOAD_EXPIRY_MS = 60 * 60 * 1000;
export const MAX_OUTSTANDING_PENDING_UPLOADS = 20;
export const MAX_OWNER_ACTIVE_AND_PENDING_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_PENDING_UPLOAD_REQUESTS_PER_MINUTE = 30;
export const DEFAULT_PENDING_UPLOAD_SWEEP_LIMIT = 25;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const pendingUploadRequestWindows = new Map<string, number[]>();

export type PendingUploadPurpose = "course-material" | "teacher-photo";
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
  | "createdAt"
  | "expiresAt"
  | "filename"
  | "id"
  | "mimeType"
  | "ownerId"
  | "purpose"
  | "storageKey"
>;

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
  if (value !== "course-material" && value !== "teacher-photo") {
    throw pendingUploadError();
  }
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
        : storageKey.startsWith(`${publicTeacherPhotoNamespace(ownerId)}/`);
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

function addStorageObject(objects: Map<string, number>, storageKey: string, byteSize: number) {
  const normalizedStorageKey =
    normalizePersistedStorageReference(storageKey)?.storageKey ?? storageKey;
  if (!objects.has(normalizedStorageKey)) objects.set(normalizedStorageKey, byteSize);
}

function totalStorageBytes(objects: Map<string, number>) {
  let total = 0;
  for (const byteSize of objects.values()) {
    total += byteSize;
  }
  return total;
}

async function claimPendingUpload(
  input: {
    expiresAtOrBefore?: Date;
    ownerId?: string;
    storageKey: string;
  },
  database: PendingUploadDatabase,
) {
  try {
    return await inSerializableTransaction(database, async (transaction) => {
      const where = {
        storageKey: input.storageKey,
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
        ...(input.expiresAtOrBefore ? { expiresAt: { lte: input.expiresAtOrBefore } } : {}),
      };
      const pendingUpload = await transaction.pendingUpload.findFirst({ where });
      if (!pendingUpload) return null;

      const deleted = await transaction.pendingUpload.deleteMany({
        where: {
          id: pendingUpload.id,
          storageKey: input.storageKey,
          ...(input.ownerId ? { ownerId: input.ownerId } : {}),
          ...(input.expiresAtOrBefore ? { expiresAt: { lte: input.expiresAtOrBefore } } : {}),
        },
      });
      return deleted.count === 1 ? (pendingUpload as PendingUploadRow) : null;
    });
  } catch (error) {
    if (isSerializableTransactionConflict(error)) return null;
    throw error;
  }
}

async function recreateExpiredPendingUpload(
  pendingUpload: PendingUploadRow,
  now: Date,
  database: PendingUploadDatabase,
) {
  try {
    await database.pendingUpload.create({
      data: {
        ownerId: pendingUpload.ownerId,
        purpose: pendingUpload.purpose,
        storageKey: pendingUpload.storageKey,
        filename: pendingUpload.filename,
        mimeType: pendingUpload.mimeType,
        byteSize: pendingUpload.byteSize,
        expiresAt: now,
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function deleteClaimedPendingUploadObject(
  pendingUpload: PendingUploadRow,
  storage: PendingUploadStorage,
  now: Date,
  database: PendingUploadDatabase,
) {
  if (await isStorageObjectReferenced(pendingUpload.storageKey, database)) {
    return { deleted: false, referenced: true, retried: false };
  }

  try {
    await storage.delete(pendingUpload.storageKey);
    return { deleted: true, referenced: false, retried: false };
  } catch {
    const retried = await recreateExpiredPendingUpload(pendingUpload, now, database);
    return { deleted: false, referenced: false, retried };
  }
}

export function consumePendingUploadRequestRateLimit(ownerId: string, now = new Date()) {
  const validOwnerId = assertOwnerId(ownerId);
  const currentTime = now.getTime();
  const cutoff = currentTime - RATE_LIMIT_WINDOW_MS;
  const requests = (pendingUploadRequestWindows.get(validOwnerId) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );
  if (requests.length >= MAX_PENDING_UPLOAD_REQUESTS_PER_MINUTE) {
    throw pendingUploadError();
  }
  requests.push(currentTime);
  pendingUploadRequestWindows.set(validOwnerId, requests);
}

async function finalizePendingUploads(
  input: {
    ownerId: string;
    purpose: PendingUploadPurpose;
    uploads: PendingUploadMetadata[];
    now?: Date;
  },
  database: PendingUploadDatabase = prisma,
) {
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
      pendingUpload.filename !== upload.filename ||
      pendingUpload.mimeType !== upload.mimeType ||
      pendingUpload.byteSize !== upload.byteSize
    ) {
      throw pendingUploadError();
    }
  }

  const deleted = await database.pendingUpload.deleteMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      ownerId,
      purpose: input.purpose,
      expiresAt: { gt: now },
    },
  });
  if (deleted.count !== uploads.length) throw pendingUploadError();
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
  const candidates = await database.pendingUpload.findMany({
    where: {
      expiresAt: { lte: now },
      ...(ownerId ? { ownerId } : {}),
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  const summary = {
    claimed: 0,
    deleted: 0,
    deleteFailures: 0,
    referenced: 0,
    retried: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const claimed = await claimPendingUpload(
      {
        storageKey: candidate.storageKey,
        ...(ownerId ? { ownerId } : {}),
        expiresAtOrBefore: now,
      },
      database,
    );
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    summary.claimed += 1;
    const result = await deleteClaimedPendingUploadObject(claimed, input.storage, now, database);
    if (result.deleted) summary.deleted += 1;
    if (result.referenced) summary.referenced += 1;
    if (!result.deleted && !result.referenced) summary.deleteFailures += 1;
    if (result.retried) summary.retried += 1;
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

  await sweepExpiredPendingUploads({ ownerId, storage: input.storage, now }, database);

  return inSerializableTransaction(database, async (transaction) => {
    const [pendingUploads, activeAttachments] = await Promise.all([
      transaction.pendingUpload.findMany({
        where: { ownerId, expiresAt: { gt: now } },
        select: { storageKey: true, byteSize: true },
      }),
      transaction.attachment.findMany({
        where: { courseMaterial: { is: { teacherId: ownerId } } },
        distinct: ["storageKey"],
        select: { storageKey: true, size: true },
      }),
    ]);

    if (pendingUploads.length >= MAX_OUTSTANDING_PENDING_UPLOADS) throw pendingUploadError();

    const objects = new Map<string, number>();
    for (const attachment of activeAttachments) {
      addStorageObject(objects, attachment.storageKey, attachment.size);
    }
    for (const pendingUpload of pendingUploads) {
      addStorageObject(objects, pendingUpload.storageKey, pendingUpload.byteSize);
    }
    if (objects.has(metadata.storageKey)) throw pendingUploadError();

    const activeAndPendingBytes = totalStorageBytes(objects);
    if (
      !Number.isSafeInteger(activeAndPendingBytes) ||
      activeAndPendingBytes + metadata.byteSize > MAX_OWNER_ACTIVE_AND_PENDING_BYTES
    ) {
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
    storageKey = validateStorageKey(input.storageKey);
  } catch {
    return { claimed: false, deleted: false, referenced: false, retried: false };
  }
  const now = input.now ?? new Date();
  const claimed = await claimPendingUpload({ ownerId, storageKey }, database);
  if (!claimed) return { claimed: false, deleted: false, referenced: false, retried: false };

  const result = await deleteClaimedPendingUploadObject(claimed, input.storage, now, database);
  return { claimed: true, ...result };
}

export { finalizePendingUploads };
