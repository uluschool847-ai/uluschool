import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: UserRole | "GUEST"; email: string } | null = null;

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

const createHomeworkAssignmentMock = vi.hoisted(() => vi.fn());
const updateHomeworkAssignmentMock = vi.hoisted(() => vi.fn());
const archiveHomeworkAssignmentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  createHomeworkAssignment: createHomeworkAssignmentMock,
  updateHomeworkAssignment: updateHomeworkAssignmentMock,
  archiveHomeworkAssignment: archiveHomeworkAssignmentMock,
}));

import {
  archiveHomeworkAction,
  createHomeworkAction,
  editHomeworkAction,
} from "@/app/portal/teacher/actions/homework-actions";
import { requireRole } from "@/lib/auth/session";

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/homework-actions.ts";

const validHomeworkPayload = {
  title: "Math Homework",
  description: "Pages 10-12",
  classId: "class-1",
  dueDate: "2026-06-10T08:00:00.000Z",
};

function expectEnumTeacherGuardSource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function expectRejectedAuthResult(result: unknown) {
  const message = result instanceof Error ? result.message : JSON.stringify(result);
  expect(message).toMatch(/forbidden|unauthorized|invalid|redirect/i);
}

describe("Teacher Homework Actions (RBAC + validation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "teacher-1", role: UserRole.TEACHER, email: "teacher1@test.local" };
  });

  it("uses enum-based teacher guards in source", () => {
    expectEnumTeacherGuardSource();
  });

  it("blocks STUDENT from creating homework", async () => {
    mockSession = { uid: "student-1", role: UserRole.STUDENT, email: "student@test.local" };

    const result = await createHomeworkAction({
      title: "Biology Homework",
      description: "Chapter 2",
      classId: "class-1",
      dueDate: "2026-06-01T10:00:00.000Z",
    }).catch((error: Error) => error);

    if (result instanceof Error) {
      expect(result.message).toMatch(/forbidden|unauthorized/i);
      return;
    }

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/forbidden|unauthorized/i);
    expect(createHomeworkAssignmentMock).not.toHaveBeenCalled();
    expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before any homework mutation",
    async (role) => {
      mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.local` };

      const createResult = await createHomeworkAction(validHomeworkPayload).catch(
        (error: Error) => error,
      );
      const editResult = await editHomeworkAction("hw-1", validHomeworkPayload).catch(
        (error: Error) => error,
      );
      const archiveResult = await archiveHomeworkAction("hw-1").catch((error: Error) => error);

      expectRejectedAuthResult(createResult);
      expectRejectedAuthResult(editResult);
      expectRejectedAuthResult(archiveResult);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(createHomeworkAssignmentMock).not.toHaveBeenCalled();
      expect(updateHomeworkAssignmentMock).not.toHaveBeenCalled();
      expect(archiveHomeworkAssignmentMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before homework mutation", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new Error("NEXT_REDIRECT:/portal/login?reason=invalid"),
    );

    const result = await createHomeworkAction(validHomeworkPayload);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/invalid|redirect/i),
      }),
    );
    expect(createHomeworkAssignmentMock).not.toHaveBeenCalled();
  });

  it("blocks GUEST from editing or archiving homework", async () => {
    mockSession = null;

    const editResult = await editHomeworkAction("hw-1", {
      title: "Updated title",
      dueDate: "2026-06-02T12:00:00.000Z",
    }).catch((error: Error) => error);

    const archiveResult = await archiveHomeworkAction("hw-1").catch((error: Error) => error);

    const firstMessage =
      editResult instanceof Error ? editResult.message : JSON.stringify(editResult);
    const secondMessage =
      archiveResult instanceof Error ? archiveResult.message : JSON.stringify(archiveResult);

    expect(firstMessage).toMatch(/forbidden|unauthorized/i);
    expect(secondMessage).toMatch(/forbidden|unauthorized/i);
  });

  it("allows TEACHER to create, edit, and archive homework", async () => {
    createHomeworkAssignmentMock.mockResolvedValue({
      id: "hw-1",
      title: "Math Homework",
      description: "Pages 10-12",
      scheduledClassId: "class-1",
      dueDate: new Date("2026-06-10T08:00:00.000Z"),
    });
    updateHomeworkAssignmentMock.mockResolvedValue({
      id: "hw-1",
      title: "Updated Math Homework",
      description: "Pages 10-15",
      dueDate: new Date("2026-06-11T08:00:00.000Z"),
    });
    archiveHomeworkAssignmentMock.mockResolvedValue({
      id: "hw-1",
      archivedAt: new Date("2026-06-12T08:00:00.000Z"),
    });

    const createResult = await createHomeworkAction({
      ...validHomeworkPayload,
    });
    const editResult = await editHomeworkAction("hw-1", {
      title: "Updated Math Homework",
      description: "Pages 10-15",
      dueDate: "2026-06-11T08:00:00.000Z",
    });
    const archiveResult = await archiveHomeworkAction("hw-1");

    expect(createHomeworkAssignmentMock).toHaveBeenCalled();
    expect(updateHomeworkAssignmentMock).toHaveBeenCalled();
    expect(archiveHomeworkAssignmentMock).toHaveBeenCalledWith("hw-1", "teacher-1");

    expect(createResult.success).toBe(true);
    expect(editResult.success).toBe(true);
    expect(archiveResult.success).toBe(true);
  });

  it("returns validation error when required fields are missing", async () => {
    const result = await createHomeworkAction({
      title: "",
      description: "No title",
      classId: "class-1",
      dueDate: "2026-06-01T10:00:00.000Z",
    }).catch((error: Error) => error);

    if (result instanceof Error) {
      expect(result.message).toMatch(/bad request|validation|title/i);
      return;
    }

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/title|validation|bad request/i);
  });

  it("returns validation error when dueDate is invalid", async () => {
    const result = await createHomeworkAction({
      title: "Chemistry Work",
      description: "Lab prep",
      classId: "class-1",
      dueDate: "not-a-date",
    }).catch((error: Error) => error);

    if (result instanceof Error) {
      expect(result.message).toMatch(/bad request|validation|due/i);
      return;
    }

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/due|validation|bad request|date/i);
  });
});
