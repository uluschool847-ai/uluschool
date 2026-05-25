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

const createManualGradeEntryForTeacherMock = vi.hoisted(() => vi.fn());
const updateManualGradeEntryForTeacherMock = vi.hoisted(() => vi.fn());
const archiveManualGradeEntryForTeacherMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/gradebook-repository", () => ({
  archiveManualGradeEntryForTeacher: archiveManualGradeEntryForTeacherMock,
  createManualGradeEntryForTeacher: createManualGradeEntryForTeacherMock,
  updateManualGradeEntryForTeacher: updateManualGradeEntryForTeacherMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type ManualGradeActionsModule = {
  createManualGradeAction: (payload: Record<string, unknown>) => Promise<unknown>;
  updateManualGradeAction: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
  archiveManualGradeAction: (id: string) => Promise<unknown>;
};

function loadManualGradeActions() {
  const specifier = "@/app/portal/teacher/actions/manual-grade-actions";
  return import(/* @vite-ignore */ specifier) as Promise<ManualGradeActionsModule>;
}

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/manual-grade-actions.ts";

const validPayload = {
  academicTermId: "term-1",
  classGroupId: "group-1",
  description: "Strong oral explanation",
  score: 92,
  studentId: "student-1",
  subjectId: "subject-1",
  teacherId: "spoofed-teacher",
  title: "Oral checkpoint",
};

function repositoryResult(overrides: Record<string, unknown> = {}) {
  return {
    after: {
      academicTermId: "term-1",
      id: "manual-1",
      score: 92,
      studentId: "student-1",
      subjectId: "subject-1",
      teacherId: "teacher-1",
    },
    before: null,
    id: "manual-1",
    ...overrides,
  };
}

function expectManualGradeRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/gradebook");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/gradebook/students/student-1");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
}

describe("manual grade teacher actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "teacher-1", role: UserRole.TEACHER, email: "teacher@test.local" };
    createManualGradeEntryForTeacherMock.mockResolvedValue(repositoryResult());
    updateManualGradeEntryForTeacherMock.mockResolvedValue(
      repositoryResult({
        before: { id: "manual-1", score: 88 },
        after: { id: "manual-1", score: 92 },
      }),
    );
    archiveManualGradeEntryForTeacherMock.mockResolvedValue(
      repositoryResult({
        before: { id: "manual-1", archivedAt: null, studentId: "student-1" },
        after: { id: "manual-1", archivedAt: new Date("2026-04-01"), studentId: "student-1" },
      }),
    );
  });

  it("uses enum-based teacher guard, dedicated repository, and no hidden teacherId trust", () => {
    const source = readFileSync(ACTION_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/gradebook-repository");
    expect(source).not.toContain('requireRole(["TEACHER"])');
    expect(source).not.toMatch(/teacherId\s*:\s*(payload|data|parsed\.data)\.teacherId/);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before manual grade mutation",
    async (role) => {
      mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.local` };
      const actions = await loadManualGradeActions();

      const result = await actions
        .createManualGradeAction(validPayload)
        .catch((error: Error) => error);

      expect(result).toBeInstanceOf(Error);
      expect(createManualGradeEntryForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("creates a manual grade with session teacher id, audit, and affected revalidation", async () => {
    const { createManualGradeAction } = await loadManualGradeActions();

    await createManualGradeAction(validPayload);

    expect(createManualGradeEntryForTeacherMock).toHaveBeenCalledWith("teacher-1", {
      academicTermId: "term-1",
      classGroupId: "group-1",
      description: "Strong oral explanation",
      score: 92,
      studentId: "student-1",
      subjectId: "subject-1",
      title: "Oral checkpoint",
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MANUAL_GRADE_CREATED",
        actorId: "teacher-1",
        targetId: "manual-1",
        targetType: "manualGradeEntry",
        meta: expect.objectContaining({
          academicTermId: "term-1",
          studentId: "student-1",
          subjectId: "subject-1",
          teacherId: "teacher-1",
        }),
      }),
      expect.anything(),
    );
    expectManualGradeRevalidation();
  });

  it.each([
    ["", /title/i],
    ["Missing score", /score/i, { score: undefined }],
    ["Negative score", /score/i, { score: -1 }],
    ["Too high score", /score/i, { score: 101 }],
  ])("rejects invalid payload: %s", async (_label, message, overrides = {}) => {
    const { createManualGradeAction } = await loadManualGradeActions();

    const result = await createManualGradeAction({ ...validPayload, title: _label, ...overrides });

    expect(JSON.stringify(result)).toMatch(message);
    expect(createManualGradeEntryForTeacherMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("updates a manual grade and writes before/after audit", async () => {
    const { updateManualGradeAction } = await loadManualGradeActions();

    await updateManualGradeAction("manual-1", { ...validPayload, score: 94 });

    expect(updateManualGradeEntryForTeacherMock).toHaveBeenCalledWith("manual-1", "teacher-1", {
      academicTermId: "term-1",
      classGroupId: "group-1",
      description: "Strong oral explanation",
      score: 94,
      studentId: "student-1",
      subjectId: "subject-1",
      title: "Oral checkpoint",
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MANUAL_GRADE_UPDATED",
        before: expect.anything(),
        after: expect.anything(),
        targetId: "manual-1",
      }),
      expect.anything(),
    );
  });

  it("archives a manual grade without deleting it and audits the archive", async () => {
    const { archiveManualGradeAction } = await loadManualGradeActions();

    await archiveManualGradeAction("manual-1");

    expect(archiveManualGradeEntryForTeacherMock).toHaveBeenCalledWith("manual-1", "teacher-1");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MANUAL_GRADE_ARCHIVED",
        before: expect.anything(),
        after: expect.anything(),
        targetId: "manual-1",
      }),
      expect.anything(),
    );
  });

  it("does not audit ownership or repository failures", async () => {
    createManualGradeEntryForTeacherMock.mockRejectedValueOnce(
      new Error("Student is not assigned"),
    );
    const { createManualGradeAction } = await loadManualGradeActions();

    const result = await createManualGradeAction(validPayload);

    expect(JSON.stringify(result)).toMatch(/assigned|error|failed/i);
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });
});
