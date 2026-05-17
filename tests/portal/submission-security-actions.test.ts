import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: string; email: string } | null = null;

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockSession) {
      throw new Error("Unauthorized");
    }
    if (!allowedRoles.includes(mockSession.role)) {
      throw new Error("Forbidden");
    }
    return mockSession;
  }),
}));

const submitOrResubmitStudentWorkMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  submitOrResubmitStudentWork: submitOrResubmitStudentWorkMock,
}));

import { submitWorkAction } from "@/app/portal/student/actions/submission-actions";

describe("Submission security action checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "student-1", role: "STUDENT", email: "student@test.local" };
  });

  it("rejects malformed URLs via strict Zod validation", async () => {
    const malformedUrls = ["not-a-url", "javascript:alert(1)", "ftp://wrong"];

    for (const candidate of malformedUrls) {
      const result = await submitWorkAction({
        assignmentId: "assign-1",
        contentUrl: candidate,
      });

      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).toMatch(/url|invalid|validation|required/i);
    }

    expect(submitOrResubmitStudentWorkMock).not.toHaveBeenCalled();
  });

  it("returns normalized forbidden response when repository throws ownership Unauthorized error", async () => {
    submitOrResubmitStudentWorkMock.mockRejectedValue(
      new Error("Unauthorized: Student not enrolled in this assignment's class"),
    );

    const result = await submitWorkAction({
      assignmentId: "assign-foreign",
      contentUrl: "https://drive.test/foreign-attempt",
    });

    expect(result).toEqual({
      success: false,
      error: "Forbidden/Unauthorized",
    });
  });
});
