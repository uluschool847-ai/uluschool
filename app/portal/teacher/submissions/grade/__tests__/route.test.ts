import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: UserRole } | null = {
  role: UserRole.TEACHER,
  uid: "teacher-1",
};

const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const gradeSubmissionForTeacherMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (roles: UserRole[]) => {
    if (!mockSession || !roles.includes(mockSession.role)) {
      throw new Error("Forbidden");
    }
    return mockSession;
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  gradeSubmissionForTeacher: gradeSubmissionForTeacherMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { requireRole } from "@/lib/auth/session";

async function postGrade(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  const { POST } = await import("@/app/portal/teacher/submissions/grade/route");
  return POST(
    new Request("https://school.test/portal/teacher/submissions/grade", {
      body: formData,
      method: "POST",
    }),
  );
}

function redirectedPath(response: Response) {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  return new URL(location ?? "https://school.test");
}

describe("teacher submission fallback grading route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { role: UserRole.TEACHER, uid: "teacher-1" };
    gradeSubmissionForTeacherMock.mockResolvedValue({
      after: { grade: 92, id: "submission-1" },
      assignmentId: "assignment-1",
      before: { grade: null, id: "submission-1" },
      feedback: "Strong solution.",
      grade: 92,
      id: "submission-1",
      previousGrade: null,
    });
  });

  it("requires TEACHER and grades through the dedicated repository", async () => {
    const response = await postGrade({
      feedback: "Strong solution.",
      grade: "92",
      returnTo: "/portal/teacher/submissions/submission-1",
      submissionId: "submission-1",
    });

    const location = redirectedPath(response);
    expect(response.status).toBe(303);
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(gradeSubmissionForTeacherMock).toHaveBeenCalledWith("teacher-1", "submission-1", {
      feedback: "Strong solution.",
      grade: 92,
    });
    expect(location.pathname).toBe("/portal/teacher/submissions/submission-1");
    expect(location.searchParams.get("graded")).toBe("success");
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions before grading",
    async (role) => {
      mockSession = { role, uid: `user-${role.toLowerCase()}` };

      const response = await postGrade({
        feedback: "Nope",
        grade: "90",
        returnTo: "/portal/teacher/submissions/submission-1",
        submissionId: "submission-1",
      });

      const location = redirectedPath(response);
      expect(location.pathname).toBe("/portal/teacher/submissions/submission-1");
      expect(location.searchParams.get("error")).toBe("grade");
      expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it.each(["-1", "101", "not-a-number", ""])(
    "returns an encoded error for invalid grade %s without audit",
    async (grade) => {
      const response = await postGrade({
        feedback: "Invalid",
        grade,
        returnTo: "/portal/teacher/submissions/submission-1",
        submissionId: "submission-1",
      });

      const location = redirectedPath(response);
      expect(location.pathname).toBe("/portal/teacher/submissions/submission-1");
      expect(location.searchParams.get("error")).toBe("grade");
      expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("rejects over-limit feedback without grading, audit, or revalidation", async () => {
    const response = await postGrade({
      feedback: "x".repeat(2001),
      grade: "90",
      returnTo: "/portal/teacher/submissions/submission-1",
      submissionId: "submission-1",
    });

    const location = redirectedPath(response);
    expect(location.pathname).toBe("/portal/teacher/submissions/submission-1");
    expect(location.searchParams.get("error")).toBe("feedback");
    expect(gradeSubmissionForTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("normalizes blank feedback %# to null", async (feedback) => {
    const response = await postGrade({
      feedback,
      grade: "88",
      returnTo: "/portal/teacher/submissions/submission-1",
      submissionId: "submission-1",
    });

    const location = redirectedPath(response);
    expect(location.searchParams.get("graded")).toBe("success");
    expect(gradeSubmissionForTeacherMock).toHaveBeenCalledWith("teacher-1", "submission-1", {
      feedback: null,
      grade: 88,
    });
  });

  it.each(["https://evil.test/phish", "/admin", "/portal/student", "/portal/parent"])(
    "open-redirect-protects unsafe returnTo %s",
    async (returnTo) => {
      const response = await postGrade({
        feedback: "Safe redirect",
        grade: "88",
        returnTo,
        submissionId: "submission-1",
      });

      const location = redirectedPath(response);
      expect(location.origin).toBe("https://school.test");
      expect(location.pathname).toBe("/portal/teacher/submissions");
      expect(location.searchParams.get("graded")).toBe("success");
    },
  );

  it("preserves safe internal teacher submission returnTo query params", async () => {
    const response = await postGrade({
      feedback: "Updated",
      grade: "95",
      returnTo: "/portal/teacher/submissions/submission-1?status=pending",
      submissionId: "submission-1",
    });

    const location = redirectedPath(response);
    expect(location.pathname).toBe("/portal/teacher/submissions/submission-1");
    expect(location.searchParams.get("status")).toBe("pending");
    expect(location.searchParams.get("graded")).toBe("success");
  });

  it("writes update audit and revalidates the grading views on success", async () => {
    gradeSubmissionForTeacherMock.mockResolvedValueOnce({
      after: { grade: 94, id: "submission-1" },
      assignmentId: "assignment-1",
      before: { grade: 90, id: "submission-1" },
      feedback: "Updated feedback.",
      grade: 94,
      id: "submission-1",
      previousGrade: 90,
    });

    await postGrade({
      feedback: "Updated feedback.",
      grade: "94",
      returnTo: "/portal/teacher/submissions/submission-1",
      submissionId: "submission-1",
    });

    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUBMISSION_GRADE_UPDATED",
        meta: expect.objectContaining({
          assignmentId: "assignment-1",
          previousGrade: 90,
          teacherId: "teacher-1",
        }),
        targetId: "submission-1",
        targetType: "submission",
      }),
      expect.anything(),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/submissions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/submissions/submission-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
  });
});
