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

vi.mock("@/lib/repositories/portal-repository", () => ({
  createProgressNote: createProgressNoteMock,
  updateProgressNote: updateProgressNoteMock,
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

  it("submits a progress note successfully for TEACHER", async () => {
    createProgressNoteMock.mockResolvedValue({
      id: "note-1",
      studentId: "student-101",
      subjectId: "subject-123",
      teacherNotes: "Excellent improvement",
      gradeLevel: "EXCELLENT",
    });

    const result = await submitProgressNoteAction({
      ...validProgressPayload,
    });

    expect(createProgressNoteMock).toHaveBeenCalledWith(
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
  });

  it("does not silently create progress notes when repository rejects teacher-student ownership", async () => {
    createProgressNoteMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await submitProgressNoteAction({
      studentId: "student-outside-class",
      subjectId: "subject-123",
      content: "Attempt for an unassigned student",
      performanceLevel: "GOOD",
    });

    expect(createProgressNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-123",
        studentId: "student-outside-class",
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/unauthorized|not assigned|forbidden/i);
  });

  it("does not silently update progress notes when repository rejects teacher ownership", async () => {
    updateProgressNoteMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const result = await editProgressNoteAction("note-outside-class", validProgressUpdate);

    expect(updateProgressNoteMock).toHaveBeenCalledWith(
      "note-outside-class",
      "teacher-123",
      expect.objectContaining({
        content: "Updated progress",
        performanceLevel: "GOOD",
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/unauthorized|not assigned|forbidden/i);
  });
});
