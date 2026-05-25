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

const createProgressNoteMock = vi.hoisted(() => vi.fn());
const updateProgressNoteMock = vi.hoisted(() => vi.fn());
const archiveProgressNoteForTeacherMock = vi.hoisted(() => vi.fn());
const createProgressNoteForTeacherMock = vi.hoisted(() => vi.fn());
const updateProgressNoteForTeacherMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  createProgressNote: createProgressNoteMock,
  updateProgressNote: updateProgressNoteMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  archiveProgressNoteForTeacher: archiveProgressNoteForTeacherMock,
  createProgressNoteForTeacher: createProgressNoteForTeacherMock,
  updateProgressNoteForTeacher: updateProgressNoteForTeacherMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import {
  editProgressNoteAction,
  submitProgressNoteAction,
} from "@/app/portal/teacher/actions/progress-actions";
import { requireRole } from "@/lib/auth/session";

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/progress-actions.ts";

const validProgressPayload = {
  studentId: "student-101",
  subjectId: "subject-123",
  content: "Excellent improvement",
  performanceLevel: "EXCELLENT",
};

const validProgressUpdate = {
  content: "Updated progress",
  performanceLevel: "GOOD",
};

function expectEnumTeacherGuardSource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("UserRole.TEACHER");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function expectDedicatedProgressRepositorySource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("@/lib/repositories/student-progress-repository");
  expect(source).not.toMatch(
    /from\s+["']@\/lib\/repositories\/portal-repository["'][\s\S]*(createProgressNote|updateProgressNote|archiveProgressNote)/,
  );
  expect(source).not.toMatch(/teacherId\s*:\s*(payload|parsed\.data|data)\.teacherId/);
}

function expectProgressRevalidation(studentId = "student-101") {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/portal/teacher/students/${studentId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith(`/portal/teacher/students/${studentId}/progress`);
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/classes");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/students/${studentId}`);
}

function expectRejectedAuthResult(result: unknown) {
  const message = result instanceof Error ? result.message : JSON.stringify(result);
  expect(message).toMatch(/forbidden|unauthorized|invalid|redirect/i);
}

describe("Teacher progress-note actions integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "teacher-123", role: UserRole.TEACHER, email: "teacher@test.local" };
  });

  it("uses enum-based teacher guards in source", () => {
    expectEnumTeacherGuardSource();
  });

  it("imports dedicated student progress repository and does not trust hidden teacherId", () => {
    expectDedicatedProgressRepositorySource();
  });

  it("allows only TEACHER role to create or edit progress notes", async () => {
    mockSession = { uid: "student-101", role: UserRole.STUDENT, email: "student@test.local" };

    const createAsStudent = await submitProgressNoteAction({
      studentId: "student-101",
      subjectId: "subject-123",
      content: "Attempt by student",
      performanceLevel: "GOOD",
    }).catch((error: Error) => error);

    const editAsStudent = await editProgressNoteAction("note-1", {
      content: "Edit attempt by student",
      performanceLevel: "EXCELLENT",
    }).catch((error: Error) => error);

    const createMessage =
      createAsStudent instanceof Error ? createAsStudent.message : JSON.stringify(createAsStudent);
    const editMessage =
      editAsStudent instanceof Error ? editAsStudent.message : JSON.stringify(editAsStudent);

    expect(createMessage).toMatch(/forbidden|unauthorized/i);
    expect(editMessage).toMatch(/forbidden|unauthorized/i);
    expect(createProgressNoteMock).not.toHaveBeenCalled();
    expect(updateProgressNoteMock).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before progress mutations",
    async (role) => {
      mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.local` };

      const createResult = await submitProgressNoteAction(validProgressPayload).catch(
        (error: Error) => error,
      );
      const editResult = await editProgressNoteAction("note-1", validProgressUpdate).catch(
        (error: Error) => error,
      );

      expectRejectedAuthResult(createResult);
      expectRejectedAuthResult(editResult);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(createProgressNoteMock).not.toHaveBeenCalled();
      expect(updateProgressNoteMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before progress mutation", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new Error("NEXT_REDIRECT:/portal/login?reason=invalid"),
    );

    const result = await submitProgressNoteAction(validProgressPayload);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/invalid|redirect/i),
      }),
    );
    expect(createProgressNoteMock).not.toHaveBeenCalled();
  });

  it("validates content and performanceLevel enum", async () => {
    const missingContent = await submitProgressNoteAction({
      studentId: "student-101",
      subjectId: "subject-123",
      content: "",
      performanceLevel: "GOOD",
    }).catch((error: Error) => error);

    const invalidPerformanceLevel = await submitProgressNoteAction({
      studentId: "student-101",
      subjectId: "subject-123",
      content: "Valid note",
      performanceLevel: "AVERAGE",
    }).catch((error: Error) => error);

    if (!(missingContent instanceof Error)) {
      expect(missingContent.success).toBe(false);
      expect(JSON.stringify(missingContent)).toMatch(/content|validation|required/i);
    } else {
      expect(missingContent.message).toMatch(/content|validation|required/i);
    }

    if (!(invalidPerformanceLevel instanceof Error)) {
      expect(invalidPerformanceLevel.success).toBe(false);
      expect(JSON.stringify(invalidPerformanceLevel)).toMatch(/performance|enum|validation/i);
    } else {
      expect(invalidPerformanceLevel.message).toMatch(/performance|enum|validation/i);
    }
  });

  it("validates subject and content max length before creating progress", async () => {
    const missingSubject = await submitProgressNoteAction({
      studentId: "student-101",
      subjectId: "",
      content: "Valid content",
      performanceLevel: "GOOD",
    });
    const tooLong = await submitProgressNoteAction({
      studentId: "student-101",
      subjectId: "subject-123",
      content: "x".repeat(2001),
      performanceLevel: "GOOD",
    });

    expect(missingSubject.success).toBe(false);
    expect(JSON.stringify(missingSubject)).toMatch(/subject|required/i);
    expect(tooLong.success).toBe(false);
    expect(JSON.stringify(tooLong)).toMatch(/content|2000/i);
    expect(createProgressNoteForTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("submits a progress note successfully for TEACHER", async () => {
    createProgressNoteForTeacherMock.mockResolvedValue({
      id: "note-1",
      studentId: "student-101",
      subjectId: "subject-123",
      teacherId: "teacher-123",
      teacherNotes: "Excellent improvement",
      gradeLevel: "EXCELLENT",
      before: null,
      after: {
        id: "note-1",
        studentId: "student-101",
        subjectId: "subject-123",
        teacherId: "teacher-123",
        gradeLevel: "EXCELLENT",
        teacherNotes: "Excellent improvement",
      },
    });

    const result = await submitProgressNoteAction({
      ...validProgressPayload,
    });

    expect(createProgressNoteForTeacherMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-123",
        studentId: "student-101",
        subjectId: "subject-123",
        content: "Excellent improvement",
        performanceLevel: "EXCELLENT",
      }),
    );
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(result.success).toBe(true);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "STUDENT_PROGRESS_CREATED",
        actorId: "teacher-123",
        targetId: "note-1",
        targetType: "studentProgress",
        meta: expect.objectContaining({
          teacherId: "teacher-123",
          studentId: "student-101",
          subjectId: "subject-123",
          progressNoteId: "note-1",
          performanceLevel: "EXCELLENT",
        }),
      }),
      expect.anything(),
    );
    expectProgressRevalidation();
  });

  it("does not silently create progress notes when repository rejects teacher-student ownership", async () => {
    createProgressNoteForTeacherMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await submitProgressNoteAction({
      studentId: "student-outside-class",
      subjectId: "subject-123",
      content: "Attempt for an unassigned student",
      performanceLevel: "GOOD",
    });

    expect(createProgressNoteForTeacherMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-123",
        studentId: "student-outside-class",
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/unauthorized|not assigned|forbidden/i);
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not silently update progress notes when repository rejects teacher ownership", async () => {
    updateProgressNoteForTeacherMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await editProgressNoteAction("note-outside-class", validProgressUpdate);

    expect(updateProgressNoteForTeacherMock).toHaveBeenCalledWith(
      "note-outside-class",
      "teacher-123",
      expect.objectContaining({
        content: "Updated progress",
        performanceLevel: "GOOD",
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/unauthorized|not assigned|forbidden/i);
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updates progress notes with audit and revalidation through dedicated repository", async () => {
    updateProgressNoteForTeacherMock.mockResolvedValueOnce({
      id: "note-1",
      studentId: "student-101",
      subjectId: "subject-123",
      teacherId: "teacher-123",
      gradeLevel: "GOOD",
      teacherNotes: "Updated progress",
      before: {
        id: "note-1",
        gradeLevel: "STRUGGLING",
        teacherNotes: "Needs revision",
      },
      after: {
        id: "note-1",
        gradeLevel: "GOOD",
        teacherNotes: "Updated progress",
      },
    });

    const result = await editProgressNoteAction("note-1", validProgressUpdate);

    expect(result.success).toBe(true);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "STUDENT_PROGRESS_UPDATED",
        before: expect.objectContaining({ teacherNotes: "Needs revision" }),
        after: expect.objectContaining({ teacherNotes: "Updated progress" }),
        meta: expect.objectContaining({
          progressNoteId: "note-1",
          performanceLevel: "GOOD",
          studentId: "student-101",
          subjectId: "subject-123",
          teacherId: "teacher-123",
        }),
      }),
      expect.anything(),
    );
    expectProgressRevalidation();
  });

  it("archives progress notes with audit, revalidation, and no broad delete helper", async () => {
    const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
    expect(source).toContain("archiveProgressNoteAction");

    const actions = await import("@/app/portal/teacher/actions/progress-actions");
    archiveProgressNoteForTeacherMock.mockResolvedValueOnce({
      id: "note-1",
      studentId: "student-101",
      subjectId: "subject-123",
      teacherId: "teacher-123",
      gradeLevel: "GOOD",
      before: { id: "note-1", archivedAt: null },
      after: { id: "note-1", archivedAt: new Date("2026-06-02T10:00:00.000Z") },
    });

    const result = await actions.archiveProgressNoteAction("note-1");

    expect(result.success).toBe(true);
    expect(archiveProgressNoteForTeacherMock).toHaveBeenCalledWith("note-1", "teacher-123");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "STUDENT_PROGRESS_ARCHIVED",
        targetId: "note-1",
        targetType: "studentProgress",
        meta: expect.objectContaining({
          progressNoteId: "note-1",
          teacherId: "teacher-123",
          studentId: "student-101",
          subjectId: "subject-123",
        }),
      }),
      expect.anything(),
    );
    expectProgressRevalidation();
  });
});
