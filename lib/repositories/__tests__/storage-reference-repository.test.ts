import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  attachment: { findFirst: vi.fn() },
  courseMaterial: { findFirst: vi.fn() },
  reportSnapshot: { findFirst: vi.fn() },
  submission: { findFirst: vi.fn() },
  teacher: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  findUnreferencedStorageKeys,
  isStorageObjectReferenced,
} from "@/lib/repositories/storage-reference-repository";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const currentKey = "private/teachers/teacher-1/materials/worksheet.pdf";
const legacyKey = "uploads/materials/worksheet.pdf";

describe("storage reference repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.attachment.findFirst.mockResolvedValue(null);
    prismaMock.courseMaterial.findFirst.mockResolvedValue(null);
    prismaMock.reportSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.submission.findFirst.mockResolvedValue(null);
    prismaMock.teacher.findFirst.mockResolvedValue(null);
  });

  it("normalizes a candidate to its full alias set before checking every persisted reference column", async () => {
    const currentUrl = storageUrlForKey(currentKey);
    prismaMock.attachment.findFirst.mockResolvedValueOnce({ id: "attachment-1" });

    await expect(isStorageObjectReferenced(currentUrl)).resolves.toBe(true);

    const expectedAliases = [currentKey, currentUrl];
    expect(prismaMock.attachment.findFirst).toHaveBeenCalledWith({
      where: { storageKey: { in: expectedAliases } },
      select: { id: true },
    });
    expect(prismaMock.courseMaterial.findFirst).toHaveBeenCalledWith({
      where: { fileUrl: { in: expectedAliases } },
      select: { id: true },
    });
    expect(prismaMock.submission.findFirst).toHaveBeenCalledWith({
      where: { contentUrl: { in: expectedAliases } },
      select: { id: true },
    });
    expect(prismaMock.reportSnapshot.findFirst).toHaveBeenCalledWith({
      where: { pdfStorageKey: { in: expectedAliases } },
      select: { id: true },
    });
    expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith({
      where: { photoUrl: { in: expectedAliases } },
      select: { id: true },
    });
  });

  it.each([
    ["attachment", "attachment", "storageKey"],
    ["course material", "courseMaterial", "fileUrl"],
    ["submission", "submission", "contentUrl"],
    ["report snapshot", "reportSnapshot", "pdfStorageKey"],
    ["teacher photo", "teacher", "photoUrl"],
  ] as const)("treats a %s alias reference as live", async (_label, model, column) => {
    const alias = "/public/uploads/materials/worksheet.pdf";
    prismaMock[model].findFirst.mockImplementationOnce(
      async ({ where }: { where: Record<string, unknown> }) => {
        const values = ((where[column] as { in?: unknown[] } | undefined)?.in ?? []) as unknown[];
        return values.includes(alias) ? { id: `${model}-1` } : null;
      },
    );

    await expect(isStorageObjectReferenced(legacyKey)).resolves.toBe(true);
  });

  it("fails closed when any cross-table lookup errors", async () => {
    prismaMock.submission.findFirst.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(isStorageObjectReferenced(currentKey)).resolves.toBe(true);
  });

  it("returns only normalized, unreferenced keys and accepts a transaction-shaped database client", async () => {
    const transaction = {
      attachment: { findFirst: vi.fn().mockResolvedValue(null) },
      courseMaterial: { findFirst: vi.fn().mockResolvedValue(null) },
      reportSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
      submission: { findFirst: vi.fn().mockResolvedValue(null) },
      teacher: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      findUnreferencedStorageKeys(
        [currentKey, storageUrlForKey(currentKey), "../../not-a-storage-key"],
        transaction,
      ),
    ).resolves.toEqual([currentKey]);
    expect(transaction.attachment.findFirst).toHaveBeenCalled();
    expect(prismaMock.attachment.findFirst).not.toHaveBeenCalled();
  });
});
