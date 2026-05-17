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

describe("Student submission action integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "student-101", role: "STUDENT", email: "student@test.local" };
  });

  it("allows only STUDENT role to submit/resubmit work", async () => {
    const blockedSessions: Array<{ uid: string; role: string; email: string } | null> = [
      { uid: "teacher-1", role: "TEACHER", email: "teacher@test.local" },
      { uid: "parent-1", role: "PARENT", email: "parent@test.local" },
      null,
    ];

    for (const session of blockedSessions) {
      mockSession = session;
      const response = await submitWorkAction({
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/submission",
      }).catch((error: Error) => error);

      const message = response instanceof Error ? response.message : JSON.stringify(response);
      expect(message).toMatch(/forbidden|unauthorized/i);
    }
  });

  it("rejects invalid payloads (missing assignmentId/contentUrl)", async () => {
    const response = await submitWorkAction({
      assignmentId: "",
      contentUrl: "",
    }).catch((error: Error) => error);

    if (response instanceof Error) {
      expect(response.message).toMatch(/validation|assignment|content|url|required/i);
      return;
    }

    expect(response.success).toBe(false);
    expect(JSON.stringify(response)).toMatch(/validation|assignment|content|url|required/i);
  });

  it("submits student work successfully with valid data", async () => {
    submitOrResubmitStudentWorkMock.mockResolvedValue({
      id: "sub-1",
      assignmentId: "assign-1",
      studentId: "student-101",
      status: "submitted",
    });

    const result = await submitWorkAction({
      assignmentId: "assign-1",
      contentUrl: "https://drive.test/submission-v1",
    });

    expect(submitOrResubmitStudentWorkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "student-101",
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/submission-v1",
      }),
    );
    expect(result.success).toBe(true);
  });
});
