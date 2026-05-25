import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: UserRole; email: string } | null = null;

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: UserRole[]) => {
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
const legacySubmitOrResubmitStudentWorkMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/submission-repository", () => ({
  submitOrResubmitStudentWork: submitOrResubmitStudentWorkMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  submitOrResubmitStudentWork: legacySubmitOrResubmitStudentWorkMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { submitWorkAction } from "@/app/portal/student/actions/submission-actions";

const ACTION_SOURCE_PATH = "app/portal/student/actions/submission-actions.ts";

function expectDedicatedSubmissionRepositorySource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("UserRole.STUDENT");
  expect(source).toContain("requireRole([UserRole.STUDENT])");
  expect(source).toContain("@/lib/repositories/submission-repository");
  expect(source).not.toMatch(
    /from\s+["']@\/lib\/repositories\/portal-repository["'][\s\S]*submitOrResubmitStudentWork/,
  );
  expect(source).not.toMatch(/studentId\s*:\s*(payload|data|parsed\.data)\.studentId/);
}

function expectSubmissionRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student/assignments");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/submissions");
}

describe("Student submission action integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "student-101", role: UserRole.STUDENT, email: "student@test.local" };
  });

  it("imports dedicated submission repository and uses enum student guard", () => {
    expectDedicatedSubmissionRepositorySource();
  });

  it("allows only STUDENT role to submit/resubmit work", async () => {
    const blockedSessions: Array<{ uid: string; role: UserRole; email: string } | null> = [
      { uid: "teacher-1", role: UserRole.TEACHER, email: "teacher@test.local" },
      { uid: "parent-1", role: UserRole.PARENT, email: "parent@test.local" },
      null,
    ];

    for (const session of blockedSessions) {
      mockSession = session;
      const response = await submitWorkAction({
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/submission",
        studentId: "student-999",
      } as never).catch((error: Error) => error);

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
      previousGrade: null,
    });

    const result = await submitWorkAction({
      assignmentId: "assign-1",
      contentUrl: "https://drive.test/submission-v1",
      studentId: "student-999",
    } as never);

    expect(submitOrResubmitStudentWorkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "student-101",
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/submission-v1",
      }),
    );
    expect(JSON.stringify(submitOrResubmitStudentWorkMock.mock.calls[0][0])).not.toContain(
      "student-999",
    );
    expect(result.success).toBe(true);
    expectSubmissionRevalidation();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns repository ownership and archived-assignment errors without audit", async () => {
    submitOrResubmitStudentWorkMock
      .mockRejectedValueOnce(new Error("Assignment is archived"))
      .mockRejectedValueOnce(
        new Error("Unauthorized: Student not enrolled in this assignment's class"),
      );

    const archivedResult = await submitWorkAction({
      assignmentId: "archived-assignment",
      contentUrl: "https://drive.test/submission",
    });
    const foreignResult = await submitWorkAction({
      assignmentId: "foreign-assignment",
      contentUrl: "https://drive.test/submission",
    });

    expect(archivedResult).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/archived/i),
      }),
    );
    expect(foreignResult).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/forbidden|unauthorized/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("keeps resubmission-after-grading behavior delegated to the repository contract", async () => {
    submitOrResubmitStudentWorkMock.mockResolvedValueOnce({
      id: "sub-1",
      assignmentId: "assign-1",
      studentId: "student-101",
      grade: null,
      feedback: null,
      previousGrade: 85,
    });

    const result = await submitWorkAction({
      assignmentId: "assign-1",
      contentUrl: "https://drive.test/resubmission",
    });

    expect(submitOrResubmitStudentWorkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "student-101",
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/resubmission",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ grade: null, feedback: null }),
      }),
    );
  });
});
