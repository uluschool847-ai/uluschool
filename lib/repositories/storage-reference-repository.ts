import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  type PersistedStorageReference,
  normalizePersistedStorageReference,
} from "@/lib/storage/storage-url";

export type StorageReferenceDatabase = typeof prisma | Prisma.TransactionClient;

function aliasesFor(reference: PersistedStorageReference) {
  return [...new Set(reference.aliases)];
}

/**
 * Returns true for every malformed or uncertain candidate. Cleanup callers must only delete when
 * this function can prove that no durable record references the normalized object aliases.
 */
export async function isStorageObjectReferenced(
  value: unknown,
  database: StorageReferenceDatabase = prisma,
) {
  const reference = normalizePersistedStorageReference(value);
  if (!reference) return true;

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
    return Boolean(attachment || courseMaterial || submission || reportSnapshot || teacher);
  } catch {
    return true;
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
    if (!(await isStorageObjectReferenced(reference.storageKey, database))) {
      unreferenced.push(reference.storageKey);
    }
  }
  return unreferenced;
}

export { findUnreferencedStorageKeys };
