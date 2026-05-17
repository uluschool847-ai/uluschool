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

const gradeSubmissionForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  gradeSubmissionForTeacher: gradeSubmissionForTeacherMock,
}));

import { gradeSubmissionAction } from "@/app/portal/teacher/actions/grading-actions";
import { requireRole } from "@/lib/auth/session";

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/grading-actions.ts";

const validGradePayload = {
  submissionId: "sub-1",
  grade: 90,
  feedback: "Good progress",
};

function expectEnumTeacherGuardSource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("UserRole.TEACHER");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function expectRejectedAuthResult(result: unknown) {
  const message = result instanceof Error ? result.message : JSON.stringify(result);
  expect(message).toMatch(/forbidden|unauthorized|invalid|redirect/i);
}

describe("Grading actions integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "teacher-1", role: UserRole.TEACHER, email: "teacher@test.local" };
  });

  it("uses enum-based teacher guards in source", () => {
    expectEnumTeacherGuardSource();
  });

  it("rejects STUDENT and GUEST roles for grading", async () => {
    mockSession = { uid: "student-1", role: UserRole.STUDENT, email: "student@test.local" };
    const studentResult = await gradeSubmissionAction(validGradePayload).catch(
      (error: Error) => error,
    );

    mockSession = null;
    const guestResult = await gradeSubmissionAction(validGradePayload).catch(
      (error: Error) => error,
    );

    const studentMessage =
      studentResult instanceof Error ? studentResult.message : JSON.stringify(studentResult);
    const guestMessage =
      guestResult instanceof Error ? guestResult.message : JSON.stringify(guestResult);

    expect(studentMessage).toMatch(/forbidden|unauthorized/i);
    expect(guestMessage).toMatch(/forbidden|unauthorized/i);
    expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before grading mutation",
    async (role) => {
      mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.local` };

      const result = await gradeSubmissionAction(validGradePayload).catch((error: Error) => error);

      expectRejectedAuthResult(result);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before grading mutation", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new Error("NEXT_REDIRECT:/portal/login?reason=invalid"),
    );

    const result = await gradeSubmissionAction(validGradePayload);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/invalid|redirect/i),
      }),
    );
    expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
  });

  it("returns validation error for invalid grade or missing fields", async () => {
    const invalidGradeResult = await gradeSubmissionAction({
      submissionId: "sub-1",
      grade: -5,
      feedback: "N/A",
    }).catch((error: Error) => error);

    const missingFieldResult = await gradeSubmissionAction({
      submissionId: "",
      grade: 75,
      feedback: "N/A",
    }).catch((error: Error) => error);

    if (!(invalidGradeResult instanceof Error)) {
      expect(invalidGradeResult.success).toBe(false);
      expect(JSON.stringify(invalidGradeResult)).toMatch(/grade|validation|bad request/i);
    } else {
      expect(invalidGradeResult.message).toMatch(/grade|validation|bad request/i);
    }

    if (!(missingFieldResult instanceof Error)) {
      expect(missingFieldResult.success).toBe(false);
      expect(JSON.stringify(missingFieldResult)).toMatch(/submission|required|validation/i);
    } else {
      expect(missingFieldResult.message).toMatch(/submission|required|validation/i);
    }
  });

  it("returns forbidden when repository reports ownership mismatch", async () => {
    gradeSubmissionForTeacherMock.mockRejectedValueOnce(
      new Error("Submission not found or not owned by teacher"),
    );

    const result = await gradeSubmissionAction({
      submissionId: "sub-foreign",
      grade: 88,
      feedback: "Checked",
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/forbidden|unauthorized|not owned|not found/i);
  });

  it("allows TEACHER to grade a valid submission", async () => {
    gradeSubmissionForTeacherMock.mockResolvedValueOnce({
      id: "sub-1",
      grade: 93,
      feedback: "Well done",
    });

    const result = await gradeSubmissionAction({
      ...validGradePayload,
      grade: 93,
      feedback: "Well done",
    });

    expect(gradeSubmissionForTeacherMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-1",
        submissionId: "sub-1",
        grade: 93,
        feedback: "Well done",
      }),
    );
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(result.success).toBe(true);
  });
});
