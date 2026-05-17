import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submission: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  gradeSubmissionForTeacher,
  listSubmissionsForAssignmentByTeacher,
} from "@/lib/repositories/portal-repository";

describe("Submission Repository - review and grading ownership workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a submission with grade and feedback when teacher owns the assignment", async () => {
    vi.mocked(prisma.submission.findFirst).mockResolvedValue({
      id: "sub-1",
      assignmentId: "assign-1",
      assignment: { teacherId: "teacher-1" },
    } as never);

    vi.mocked(prisma.submission.update).mockResolvedValue({
      id: "sub-1",
      grade: 92,
      feedback: "Strong work. Improve final explanation.",
    } as never);

    const result = await gradeSubmissionForTeacher({
      teacherId: "teacher-1",
      submissionId: "sub-1",
      grade: 92,
      feedback: "Strong work. Improve final explanation.",
    });

    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "sub-1",
        }),
      }),
    );
    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({
          grade: 92,
          feedback: "Strong work. Improve final explanation.",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "sub-1",
      }),
    );
  });

  it("throws when teacher does not own the submission assignment", async () => {
    vi.mocked(prisma.submission.findFirst).mockResolvedValue(null as never);

    await expect(
      gradeSubmissionForTeacher({
        teacherId: "teacher-1",
        submissionId: "sub-foreign",
        grade: 88,
        feedback: "Checked",
      }),
    ).rejects.toThrow(/unauthorized|not owned|not found/i);

    expect(prisma.submission.update).not.toHaveBeenCalled();
  });

  it("returns submissions for a specific assignment only if assignment belongs to teacher", async () => {
    vi.mocked(prisma.submission.findMany).mockResolvedValue([
      {
        id: "sub-1",
        assignmentId: "assign-1",
        grade: null,
        feedback: null,
      },
      {
        id: "sub-2",
        assignmentId: "assign-1",
        grade: 95,
        feedback: "Excellent",
      },
    ] as never);

    const result = await listSubmissionsForAssignmentByTeacher({
      teacherId: "teacher-1",
      assignmentId: "assign-1",
    });

    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignmentId: "assign-1",
        }),
      }),
    );
    expect(result).toHaveLength(2);
  });
});
