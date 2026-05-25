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
const legacyGradeSubmissionForTeacherMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/submission-repository", () => ({
  gradeSubmissionForTeacher: gradeSubmissionForTeacherMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  gradeSubmissionForTeacher: legacyGradeSubmissionForTeacherMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
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

function expectDedicatedGradingRepositorySource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("@/lib/repositories/submission-repository");
  expect(source).not.toMatch(
    /from\s+["']@\/lib\/repositories\/portal-repository["'][\s\S]*gradeSubmissionForTeacher/,
  );
  expect(source).not.toMatch(/teacherId\s*:\s*(payload|data|parsed\.data)\.teacherId/);
}

function expectGradingRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/submissions");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/submissions/sub-1");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
}

function expectGradingAudit(action: string) {
  expect(createAdminAuditLogMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action,
      targetType: "submission",
      targetId: "sub-1",
      actorId: "teacher-1",
      meta: expect.objectContaining({ teacherId: "teacher-1" }),
    }),
    expect.anything(),
  );
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

  it("imports dedicated submission repository grading helper and does not trust hidden teacherId", () => {
    expectDedicatedGradingRepositorySource();
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
    expect(legacyGradeSubmissionForTeacherMock).not.toHaveBeenCalled();
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
      expect(legacyGradeSubmissionForTeacherMock).not.toHaveBeenCalled();
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
    const tooHighGradeResult = await gradeSubmissionAction({
      submissionId: "sub-1",
      grade: 101,
      feedback: "N/A",
    }).catch((error: Error) => error);
    const nonNumericGradeResult = await gradeSubmissionAction({
      submissionId: "sub-1",
      grade: "A",
      feedback: "N/A",
    } as never).catch((error: Error) => error);

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

    for (const result of [tooHighGradeResult, nonNumericGradeResult]) {
      const message = result instanceof Error ? result.message : JSON.stringify(result);
      expect(message).toMatch(/grade|validation|number|100/i);
    }
    expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects over-limit feedback without repository mutation or audit", async () => {
    const result = await gradeSubmissionAction({
      submissionId: "sub-1",
      grade: 90,
      feedback: "x".repeat(2001),
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/feedback|2000/i);
    expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
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
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("allows TEACHER to grade a valid submission with audit and revalidation", async () => {
    gradeSubmissionForTeacherMock.mockResolvedValueOnce({
      id: "sub-1",
      grade: 93,
      feedback: "Well done",
      previousGrade: null,
    });

    const result = await gradeSubmissionAction({
      ...validGradePayload,
      grade: 93,
      feedback: "Well done",
    });

    expect(gradeSubmissionForTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      "sub-1",
      expect.objectContaining({ grade: 93, feedback: "Well done" }),
    );
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(result.success).toBe(true);
    expectGradingAudit("SUBMISSION_GRADED");
    expectGradingRevalidation();
  });

  it("writes SUBMISSION_GRADE_UPDATED when repository returns a previous grade", async () => {
    gradeSubmissionForTeacherMock.mockResolvedValueOnce({
      id: "sub-1",
      grade: 95,
      feedback: "Updated feedback",
      previousGrade: 90,
    });

    const result = await gradeSubmissionAction({
      submissionId: "sub-1",
      grade: 95,
      feedback: "Updated feedback",
    });

    expect(result.success).toBe(true);
    expectGradingAudit("SUBMISSION_GRADE_UPDATED");
  });

  it("includes before/after feedback and feedbackChanged audit metadata", async () => {
    gradeSubmissionForTeacherMock.mockResolvedValueOnce({
      id: "sub-1",
      grade: 95,
      feedback: "Updated feedback",
      previousGrade: 90,
      assignmentId: "assignment-1",
      before: { id: "sub-1", grade: 90, feedback: "Initial feedback" },
      after: { id: "sub-1", grade: 95, feedback: "Updated feedback" },
    });

    const result = await gradeSubmissionAction({
      submissionId: "sub-1",
      grade: 95,
      feedback: "Updated feedback",
    });

    expect(result.success).toBe(true);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUBMISSION_GRADE_UPDATED",
        before: expect.objectContaining({ feedback: "Initial feedback" }),
        after: expect.objectContaining({ feedback: "Updated feedback" }),
        meta: expect.objectContaining({
          feedbackChanged: true,
          teacherId: "teacher-1",
        }),
      }),
      expect.anything(),
    );
  });
});
