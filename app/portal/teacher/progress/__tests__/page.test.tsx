import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listProgressNotesForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listProgressNotesForTeacher: listProgressNotesForTeacherMock,
}));

type TeacherProgressIndexPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

async function loadTeacherProgressIndexPage() {
  const specifier = "@/app/portal/teacher/progress/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherProgressIndexPageModule>;
}

function progressRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "progress-1",
    student: {
      email: "amina@example.com",
      id: "student-1",
      name: "Amina Yusuf",
    },
    subject: {
      id: "subject-1",
      name: "Algebra",
    },
    performanceLevel: "GOOD",
    contentPreview: "Amina explains linear equations with clear reasoning.",
    recordedAt: "2026-05-20T09:00:00.000Z",
    updatedAt: "2026-05-21T09:00:00.000Z",
    archivedAt: null,
    statusLabel: "Active",
    href: "/portal/teacher/students/student-1/progress",
    ...overrides,
  };
}

describe("Teacher progress index page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    requireRoleMock.mockResolvedValue({ role: UserRole.TEACHER, uid: "teacher-1" });
    listProgressNotesForTeacherMock.mockResolvedValue([progressRow()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("requires TEACHER, forwards filters, and renders teacher-scoped progress rows", async () => {
    const page = await loadTeacherProgressIndexPage();
    const element = await page.default({
      searchParams: {
        performanceLevel: "GOOD",
        search: "Amina",
        sort: "studentName",
        status: "active",
        studentId: "student-1",
        subjectId: "subject-1",
      },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listProgressNotesForTeacherMock).toHaveBeenCalledWith("teacher-1", {
      performanceLevel: "GOOD",
      search: "Amina",
      sort: "studentName",
      status: "active",
      studentId: "student-1",
      subjectId: "subject-1",
    });
    expect(screen.getByRole("heading", { name: /^progress$/i })).toBeDefined();
    expect(screen.getByLabelText(/student/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/performance/i)).toBeDefined();
    expect(screen.getByLabelText(/search/i)).toBeDefined();
    expect(screen.getByLabelText(/sort/i)).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/algebra/i)).toBeDefined();
    expect(screen.getByText(/good/i)).toBeDefined();
    expect(screen.getByText(/linear equations/i)).toBeDefined();
    expect(screen.getByText(/active/i)).toBeDefined();
    expect(screen.getByText(/recorded/i)).toBeDefined();
    expect(screen.getByText(/updated/i)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /open progress|view progress|amina yusuf/i }),
    ).toHaveAttribute("href", "/portal/teacher/students/student-1/progress");
    expect(screen.queryByRole("button", { name: /^archive$/i })).toBeNull();
  });

  it("renders an unfiltered empty state and a filtered empty state", async () => {
    listProgressNotesForTeacherMock.mockResolvedValueOnce([]);
    const page = await loadTeacherProgressIndexPage();
    const emptyElement = await page.default({ searchParams: {} });
    render(emptyElement);
    expect(screen.getByText(/no progress notes/i)).toBeDefined();
    cleanup();

    listProgressNotesForTeacherMock.mockResolvedValueOnce([]);
    const filteredElement = await page.default({ searchParams: { search: "missing" } });
    render(filteredElement);
    expect(screen.getByText(/no progress notes match/i)).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading progress rows",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadTeacherProgressIndexPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listProgressNotesForTeacherMock).not.toHaveBeenCalled();
    },
  );
});
