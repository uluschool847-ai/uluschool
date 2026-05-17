import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assignment: {
      findFirst: vi.fn(),
    },
    submission: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import {
  createStudentSubmission,
  getStudentAssignmentWithSubmissionHistory,
  resubmitStudentSubmission,
} from "@/lib/repositories/portal-repository";

describe("Student submission repository workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves assignment details with submission history strictly filtered by studentId", async () => {
    vi.mocked(prisma.assignment.findFirst).mockResolvedValue({
      id: "assign-1",
      title: "Algebra Homework 1",
      description: "Solve questions 1-20.",
      dueDate: new Date("2026-08-01T10:00:00.000Z"),
      scheduledClass: { title: "IGCSE Mathematics - Set A" },
      submissions: [
        {
          id: "sub-1",
          studentId: "student-101",
          contentUrl: "https://drive.test/solution-v1",
          submittedAt: new Date("2026-07-28T09:00:00.000Z"),
          grade: null,
          feedback: null,
        },
      ],
    } as never);

    const result = await getStudentAssignmentWithSubmissionHistory({
      assignmentId: "assign-1",
      studentId: "student-101",
    });

    expect(prisma.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "assign-1",
          scheduledClass: expect.objectContaining({
            students: expect.objectContaining({
              some: { id: "student-101" },
            }),
          }),
        }),
        include: expect.objectContaining({
          submissions: expect.objectContaining({
            where: { studentId: "student-101" },
          }),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "assign-1" }));
  });

  it("creates a new submission for an assignment", async () => {
    vi.mocked(prisma.submission.create).mockResolvedValue({
      id: "sub-2",
      studentId: "student-101",
      assignmentId: "assign-2",
      contentUrl: "https://drive.test/new-submission",
      submittedAt: new Date("2026-07-30T12:00:00.000Z"),
    } as never);

    const result = await createStudentSubmission({
      studentId: "student-101",
      assignmentId: "assign-2",
      contentUrl: "https://drive.test/new-submission",
    });

    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-101",
          assignmentId: "assign-2",
          contentUrl: "https://drive.test/new-submission",
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "sub-2" }));
  });

  it("updates an existing submission during resubmission and refreshes submittedAt timestamp", async () => {
    vi.mocked(prisma.submission.update).mockResolvedValue({
      id: "sub-2",
      contentUrl: "https://drive.test/newer-submission",
      submittedAt: new Date("2026-07-31T08:10:00.000Z"),
    } as never);

    const result = await resubmitStudentSubmission({
      submissionId: "sub-2",
      studentId: "student-101",
      contentUrl: "https://drive.test/newer-submission",
    });

    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "sub-2",
        }),
        data: expect.objectContaining({
          contentUrl: "https://drive.test/newer-submission",
          submittedAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "sub-2" }));
  });

  it("prevents submission when student is not enrolled in the assignment class", async () => {
    vi.mocked(prisma.assignment.findFirst).mockResolvedValue(null as never);

    await expect(
      createStudentSubmission({
        studentId: "student-foreign",
        assignmentId: "assign-protected",
        contentUrl: "https://drive.test/illegal-submission",
      }),
    ).rejects.toThrow(/forbidden|unauthorized|not enrolled|not allowed/i);

    expect(prisma.submission.create).not.toHaveBeenCalled();
  });
});
