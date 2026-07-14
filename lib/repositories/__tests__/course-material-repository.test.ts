import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const prismaMock = vi.hoisted(() => ({
  courseMaterial: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const currentKey = "private/teachers/teacher-1/materials/current.pdf";

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "material-1",
    title: "Algebra notes",
    description: null,
    fileUrl: "https://cdn.example.com/stale.pdf",
    scheduledClassId: "class-1",
    scheduledClass: {
      id: "class-1",
      title: "Algebra",
      startAt: new Date("2026-07-14T10:00:00.000Z"),
      subject: { id: "subject-1", name: "Mathematics", slug: "mathematics" },
      classGroup: { id: "group-1", name: "Group 1" },
    },
    attachments: [
      {
        id: "attachment-1",
        filename: "current.pdf",
        storageKey: currentKey,
        mimeType: "application/pdf",
        size: 123,
      },
    ],
    createdAt: new Date("2026-07-14T09:00:00.000Z"),
    updatedAt: new Date("2026-07-14T09:00:00.000Z"),
    ...overrides,
  };
}

describe("course material storage presentation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefers a current attachment key over a stale duplicated URL", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([material()]);

    const { listStudentCourseMaterials } = await import(
      "@/lib/repositories/course-material-repository"
    );
    const [result] = await listStudentCourseMaterials("student-1");

    expect(result.safeFileUrl).toBe(storageUrlForKey(currentKey));
    expect(result.attachments[0]?.href).toBe(storageUrlForKey(currentKey));
  });

  it("preserves exact external HTTPS and trusted legacy material links", async () => {
    const external = "https://cdn.example.com/files/Notes%20One.pdf?download=1";
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material({ fileUrl: external, attachments: [] }),
      material({
        id: "legacy-material",
        fileUrl: "/uploads/legacy/material.pdf",
        attachments: [
          {
            id: "legacy-attachment",
            filename: "material.pdf",
            storageKey: "uploads/legacy/material.pdf",
            mimeType: "application/pdf",
            size: 12,
          },
        ],
      }),
    ]);

    const { listStudentCourseMaterials } = await import(
      "@/lib/repositories/course-material-repository"
    );
    const results = await listStudentCourseMaterials("student-1");

    expect(results[0]?.safeFileUrl).toBe(external);
    expect(results[1]?.safeFileUrl).toBe("/uploads/legacy/material.pdf");
    expect(results[1]?.attachments[0]?.href).toBe("/uploads/legacy/material.pdf");
  });

  it("does not expose malformed, unsafe, or mismatched application values", async () => {
    prismaMock.courseMaterial.findMany.mockResolvedValueOnce([
      material({ fileUrl: "javascript:alert(1)", attachments: [] }),
      material({ id: "protocol-relative", fileUrl: "//evil.example/file.pdf", attachments: [] }),
      material({
        id: "malformed-key",
        fileUrl: "data:application/pdf;base64,AAAA",
        attachments: [
          {
            id: "bad-attachment",
            filename: "bad.pdf",
            storageKey: "private/teachers/teacher-1/materials/../bad.pdf",
            mimeType: "application/pdf",
            size: 12,
          },
        ],
      }),
    ]);

    const { listStudentCourseMaterials } = await import(
      "@/lib/repositories/course-material-repository"
    );
    const results = await listStudentCourseMaterials("student-1");

    expect(results.map((result) => result.safeFileUrl)).toEqual([null, null, null]);
    expect(results[2]?.attachments[0]?.href).toBeNull();
  });
});
