import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assignment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    submission: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { submitOrResubmitStudentWork } from "@/lib/repositories/portal-repository";

describe("Submission security repository checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks IDOR when assignment exists but student is not enrolled in that assignment class", async () => {
    vi.mocked(prisma.submission.findMany).mockResolvedValue([] as never);

    // Assignment exists, but enrollment check does not match this student.
    vi.mocked(prisma.assignment.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.assignment.findUnique).mockResolvedValue({
      id: "assign-foreign",
      scheduledClassId: "class-foreign",
    } as never);

    await expect(
      submitOrResubmitStudentWork({
        studentId: "student-1",
        assignmentId: "assign-foreign",
        contentUrl: "https://drive.test/work-1",
      }),
    ).rejects.toThrow("Unauthorized: Student not enrolled in this assignment's class");

    expect(prisma.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "assign-foreign",
          scheduledClass: expect.objectContaining({
            students: expect.objectContaining({
              some: { id: "student-1" },
            }),
          }),
        }),
      }),
    );
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  it('returns "Not found" when assignmentId does not exist in database', async () => {
    vi.mocked(prisma.submission.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.assignment.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.assignment.findUnique).mockResolvedValue(null as never);

    await expect(
      submitOrResubmitStudentWork({
        studentId: "student-1",
        assignmentId: "assign-missing",
        contentUrl: "https://drive.test/work-missing",
      }),
    ).rejects.toThrow(/not found/i);
  });
});
