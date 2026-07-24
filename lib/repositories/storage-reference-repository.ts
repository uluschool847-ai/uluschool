import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type PersistedStorageReference,
  normalizePersistedStorageReference,
} from "@/lib/storage/storage-url";

export type StorageReferenceDatabase = typeof prisma | Prisma.TransactionClient;
export type StorageReferenceStatus = "referenced" | "unreferenced" | "unknown";

function aliasesFor(reference: PersistedStorageReference) {
  return [...new Set(reference.aliases)];
}

/**
 * Distinguishes a proved live reference from a proved orphan and lookup uncertainty. Cleanup
 * callers must delete only the `unreferenced` result.
 */
async function getStorageObjectReferenceStatus(
  value: unknown,
  database: StorageReferenceDatabase = prisma,
): Promise<StorageReferenceStatus> {
  const reference = normalizePersistedStorageReference(value);
  if (!reference) return "unknown";

  const aliases = aliasesFor(reference);
  try {
    const [attachment, courseMaterial, submission, reportSnapshot, teacher] = await Promise.all([
      database.attachment.findFirst({
        where: { storageKey: { in: aliases } },
        select: { id: true },
      }),
      database.courseMaterial.findFirst({
        where: { fileUrl: { in: aliases } },
        select: { id: true },
      }),
      database.submission.findFirst({
        where: { contentUrl: { in: aliases } },
        select: { id: true },
      }),
      database.reportSnapshot.findFirst({
        where: { pdfStorageKey: { in: aliases } },
        select: { id: true },
      }),
      database.teacher.findFirst({
        where: { photoUrl: { in: aliases } },
        select: { id: true },
      }),
    ]);
    return attachment || courseMaterial || submission || reportSnapshot || teacher
      ? "referenced"
      : "unreferenced";
  } catch {
    return "unknown";
  }
}

async function findUnreferencedStorageKeys(
  values: unknown[],
  database: StorageReferenceDatabase = prisma,
) {
  const candidates = new Map<string, PersistedStorageReference>();
  for (const value of values) {
    const reference = normalizePersistedStorageReference(value);
    if (reference && !candidates.has(reference.storageKey)) {
      candidates.set(reference.storageKey, reference);
    }
  }

  const unreferenced: string[] = [];
  for (const reference of candidates.values()) {
    if (
      (await getStorageObjectReferenceStatus(reference.storageKey, database)) === "unreferenced"
    ) {
      unreferenced.push(reference.storageKey);
    }
  }
  return unreferenced;
}

export { findUnreferencedStorageKeys, getStorageObjectReferenceStatus };
