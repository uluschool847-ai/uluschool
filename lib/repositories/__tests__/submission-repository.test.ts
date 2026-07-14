import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const prismaMock = vi.hoisted(() => ({
  submission: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const currentKey = "private/students/student-1/submissions/work.pdf";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    studentId: "student-1",
    assignmentId: "assignment-1",
    contentUrl: "https://cdn.example.com/stale.pdf",
    grade: null,
    feedback: null,
    submittedAt: new Date("2026-07-14T10:00:00.000Z"),
    updatedAt: new Date("2026-07-14T10:00:00.000Z"),
    student: { id: "student-1", fullName: "Student One", email: "student@example.com" },
    attachments: [{ id: "attachment-1", filename: "work.pdf", storageKey: currentKey }],
    assignment: {
      id: "assignment-1",
      title: "Homework",
      description: "Solve it",
      dueDate: new Date("2026-07-15T10:00:00.000Z"),
      scheduledClass: {
        id: "class-1",
        title: "Algebra",
        teacherId: "teacher-1",
        subjectId: "subject-1",
        classGroupId: "group-1",
        subject: { id: "subject-1", name: "Mathematics", slug: "mathematics" },
        classGroup: { id: "group-1", name: "Group 1", teacherId: "teacher-1" },
      },
    },
    ...overrides,
  };
}

describe("submission storage presentation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefers the attachment key for teacher submission rows", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([submission()]);

    const { listSubmissionsForTeacher } = await import("@/lib/repositories/submission-repository");
    const [result] = await listSubmissionsForTeacher("teacher-1");

    expect(result.contentUrl).toBe(storageUrlForKey(currentKey));
    expect(result.attachmentLink?.href).toBe(storageUrlForKey(currentKey));
  });

  it("preserves exact external HTTPS and trusted legacy submission values", async () => {
    const external = "https://cdn.example.com/work%20one.pdf?download=1";
    prismaMock.submission.findMany.mockResolvedValueOnce([
      submission({ contentUrl: external, attachments: [] }),
      submission({
        id: "legacy-submission",
        contentUrl: "/uploads/submissions/legacy.pdf",
        attachments: [
          {
            id: "legacy-attachment",
            filename: "legacy.pdf",
            storageKey: "uploads/submissions/legacy.pdf",
          },
        ],
      }),
    ]);

    const { listSubmissionsForTeacher } = await import("@/lib/repositories/submission-repository");
    const results = await listSubmissionsForTeacher("teacher-1");

    expect(results[0]?.contentUrl).toBe(external);
    expect(results[1]?.contentUrl).toBe("/uploads/submissions/legacy.pdf");
    expect(results[1]?.attachmentLink?.href).toBe("/uploads/submissions/legacy.pdf");
  });

  it("does not expose unsafe fallback URLs or malformed attachment keys", async () => {
    prismaMock.submission.findMany.mockResolvedValueOnce([
      submission({
        contentUrl: "file:///secret.pdf",
        attachments: [
          {
            id: "bad-attachment",
            filename: "bad.pdf",
            storageKey: "private/students/student-1/submissions/../bad.pdf",
          },
        ],
      }),
    ]);

    const { listSubmissionsForTeacher } = await import("@/lib/repositories/submission-repository");
    const [result] = await listSubmissionsForTeacher("teacher-1");

    expect(result.contentUrl).toBeNull();
    expect(result.attachmentLink).toBeNull();
  });
});
