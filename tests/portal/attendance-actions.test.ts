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

const markLessonAttendanceForTeacherMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/attendance-repository", () => ({
  markLessonAttendanceForTeacher: markLessonAttendanceForTeacherMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type AttendanceActionsModule = {
  markAttendanceAction: (payload: Record<string, unknown>) => Promise<unknown>;
  updateAttendanceAction: (
    attendanceId: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
};

function loadAttendanceActions() {
  const specifier = "@/app/portal/teacher/actions/attendance-actions";
  return import(/* @vite-ignore */ specifier) as Promise<AttendanceActionsModule>;
}

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/attendance-actions.ts";

function readActionSource() {
  return readFileSync(ACTION_SOURCE_PATH, "utf8");
}

function successfulAttendance(overrides: Record<string, unknown> = {}) {
  return {
    after: {
      id: "attendance-1",
      lateMinutes: null,
      reason: null,
      scheduledClassId: "lesson-1",
      status: "PRESENT",
      studentId: "student-1",
    },
    before: null,
    id: "attendance-1",
    lateMinutes: null,
    reason: null,
    scheduledClassId: "lesson-1",
    status: "PRESENT",
    studentId: "student-1",
    ...overrides,
  };
}

function expectAttendanceRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/schedule");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/lessons/lesson-1");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/attendance");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
}

describe("Teacher attendance actions contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { email: "teacher@test.local", role: UserRole.TEACHER, uid: "teacher-1" };
  });

  it("uses enum-based TEACHER guards and the dedicated attendance repository", () => {
    const source = readActionSource();

    expect(source).toContain("UserRole.TEACHER");
    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/attendance-repository");
    expect(source).toContain("markLessonAttendanceForTeacher");
    expect(source).not.toMatch(/teacherId\s*:\s*(payload|data|parsed\.data)\.teacherId/);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before attendance mutation",
    async (role) => {
      mockSession = { email: `${role.toLowerCase()}@test.local`, role, uid: `user-${role}` };

      const { markAttendanceAction } = await loadAttendanceActions();
      const result = await markAttendanceAction({
        scheduledClassId: "lesson-1",
        status: "PRESENT",
        studentId: "student-1",
      }).catch((error: Error) => error);
      const message = result instanceof Error ? result.message : JSON.stringify(result);

      expect(message).toMatch(/forbidden|unauthorized|redirect/i);
      expect(markLessonAttendanceForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("marks attendance using session.uid and ignores submitted teacherId", async () => {
    markLessonAttendanceForTeacherMock.mockResolvedValueOnce(successfulAttendance());

    const { markAttendanceAction } = await loadAttendanceActions();
    const result = await markAttendanceAction({
      scheduledClassId: "lesson-1",
      status: "PRESENT",
      studentId: "student-1",
      teacherId: "other-teacher",
    });

    expect(markLessonAttendanceForTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({
        scheduledClassId: "lesson-1",
        status: "PRESENT",
        studentId: "student-1",
      }),
    );
    expect(JSON.stringify(markLessonAttendanceForTeacherMock.mock.calls[0])).not.toContain(
      "other-teacher",
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_MARKED",
        after: expect.objectContaining({ status: "PRESENT" }),
        before: null,
        meta: expect.objectContaining({
          attendanceId: "attendance-1",
          lateMinutes: null,
          reason: null,
          scheduledClassId: "lesson-1",
          status: "PRESENT",
          studentId: "student-1",
          teacherId: "teacher-1",
        }),
        targetId: "attendance-1",
        targetType: "attendance",
      }),
      expect.anything(),
    );
    expectAttendanceRevalidation();
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("updates existing attendance with before/after audit metadata and reason", async () => {
    markLessonAttendanceForTeacherMock.mockResolvedValueOnce(
      successfulAttendance({
        after: {
          id: "attendance-1",
          lateMinutes: 9,
          reason: "Arrived after warm-up",
          scheduledClassId: "lesson-1",
          status: "LATE",
          studentId: "student-1",
        },
        before: {
          id: "attendance-1",
          lateMinutes: null,
          reason: null,
          scheduledClassId: "lesson-1",
          status: "PRESENT",
          studentId: "student-1",
        },
        lateMinutes: 9,
        reason: "Arrived after warm-up",
        status: "LATE",
      }),
    );

    const { updateAttendanceAction } = await loadAttendanceActions();
    const result = await updateAttendanceAction("attendance-1", {
      lateMinutes: 9,
      reason: "Arrived after warm-up",
      scheduledClassId: "lesson-1",
      status: "LATE",
      studentId: "student-1",
    });

    expect(markLessonAttendanceForTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({
        attendanceId: "attendance-1",
        lateMinutes: 9,
        reason: "Arrived after warm-up",
        status: "LATE",
      }),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_UPDATED",
        after: expect.objectContaining({ reason: "Arrived after warm-up", status: "LATE" }),
        before: expect.objectContaining({ status: "PRESENT" }),
        meta: expect.objectContaining({
          attendanceId: "attendance-1",
          lateMinutes: 9,
          reason: "Arrived after warm-up",
          scheduledClassId: "lesson-1",
          studentId: "student-1",
          teacherId: "teacher-1",
        }),
      }),
      expect.anything(),
    );
    expectAttendanceRevalidation();
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("validates late minutes and required post-live correction reason before mutation", async () => {
    const { markAttendanceAction } = await loadAttendanceActions();

    const invalidLate = await markAttendanceAction({
      lateMinutes: 0,
      scheduledClassId: "lesson-1",
      status: "LATE",
      studentId: "student-1",
    });
    const missingCorrectionReason = await markAttendanceAction({
      correction: true,
      scheduledClassId: "lesson-1",
      status: "ABSENT",
      studentId: "student-1",
    });

    expect(JSON.stringify(invalidLate)).toMatch(/late minutes|greater than 0/i);
    expect(JSON.stringify(missingCorrectionReason)).toMatch(/reason|required/i);
    expect(markLessonAttendanceForTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not audit or revalidate repository ownership failures", async () => {
    markLessonAttendanceForTeacherMock.mockRejectedValueOnce(
      new Error("Forbidden: lesson is not assigned to this teacher"),
    );

    const { markAttendanceAction } = await loadAttendanceActions();
    const result = await markAttendanceAction({
      scheduledClassId: "foreign-lesson",
      status: "PRESENT",
      studentId: "student-1",
    });

    expect(JSON.stringify(result)).toMatch(/forbidden|not assigned|unauthorized/i);
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
