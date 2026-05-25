import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherStudentDetailMock = vi.hoisted(() => vi.fn());
const listProgressNotesMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  getTeacherStudentDetail: getTeacherStudentDetailMock,
  listProgressNotesForTeacherStudent: listProgressNotesMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type TeacherStudentProgressPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

async function loadTeacherStudentProgressPage() {
  const specifier = "@/app/portal/teacher/students/[studentId]/progress/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherStudentProgressPageModule>;
}

function assignedStudent() {
  return {
    id: "student-1",
    fullName: "Amina Yusuf",
    email: "amina@example.com",
    learningStatus: "ACTIVE",
  };
}

function progressNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "progress-1",
    subject: { id: "subject-1", name: "Algebra" },
    performanceLevel: "GOOD",
    content: "Amina explains linear equations with clear reasoning.",
    teacherName: "Teacher One",
    recordedAt: "2026-05-20T09:00:00.000Z",
    updatedAt: "2026-05-21T09:00:00.000Z",
    archivedAt: null,
    canEdit: true,
    ...overrides,
  };
}

describe("Teacher student progress page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getTeacherStudentDetailMock.mockResolvedValue(assignedStudent());
    listProgressNotesMock.mockResolvedValue([progressNote()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("requires TEACHER and loads progress notes through the dedicated repository", async () => {
    const page = await loadTeacherStudentProgressPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { status: "active", subjectId: "subject-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherStudentDetailMock).toHaveBeenCalledWith("teacher-1", "student-1");
    expect(listProgressNotesMock).toHaveBeenCalledWith("teacher-1", "student-1", {
      status: "active",
      subjectId: "subject-1",
    });
    expect(
      screen.getByRole("heading", { name: /amina yusuf.*progress|progress.*amina yusuf/i }),
    ).toBeDefined();
    expect(screen.getByText(/algebra/i)).toBeDefined();
    expect(screen.getByText(/good/i)).toBeDefined();
    expect(screen.getByText(/linear equations/i)).toBeDefined();
    expect(screen.getByText(/teacher one/i)).toBeDefined();
    expect(screen.getByText(/updated/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /all progress|back to progress/i })).toHaveAttribute(
      "href",
      "/portal/teacher/progress",
    );
    expect(screen.getByRole("link", { name: /filter by student|this student/i })).toHaveAttribute(
      "href",
      "/portal/teacher/progress?studentId=student-1",
    );
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /archive/i })).toBeDefined();
  });

  it("forwards archived and all filters and renders archived notes read-only", async () => {
    listProgressNotesMock.mockResolvedValueOnce([
      progressNote({
        id: "progress-archived",
        archivedAt: "2026-05-22T09:00:00.000Z",
        canEdit: false,
        content: "Archived progress note.",
      }),
    ]);

    const page = await loadTeacherStudentProgressPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { status: "archived" },
    });
    render(element);

    expect(listProgressNotesMock).toHaveBeenCalledWith("teacher-1", "student-1", {
      status: "archived",
    });
    expect(screen.getByText(/archived progress note/i)).toBeDefined();
    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
  });

  it("renders an empty state and create form when no progress notes exist", async () => {
    listProgressNotesMock.mockResolvedValueOnce([]);

    const page = await loadTeacherStudentProgressPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByText(/no progress notes/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/content|progress note/i)).toBeDefined();
    expect(screen.getByLabelText(/performance level/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /save|create/i })).toBeDefined();
  });

  it("returns notFound for an unassigned student", async () => {
    getTeacherStudentDetailMock.mockResolvedValueOnce(null);
    const page = await loadTeacherStudentProgressPage();

    await expect(page.default({ params: { studentId: "student-foreign" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(listProgressNotesMock).not.toHaveBeenCalled();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading progress notes",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadTeacherStudentProgressPage();

      await expect(page.default({ params: { studentId: "student-1" } })).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(listProgressNotesMock).not.toHaveBeenCalled();
    },
  );
});
