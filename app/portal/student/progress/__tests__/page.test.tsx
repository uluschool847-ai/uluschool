import { existsSync, readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listProgressNotesForStudentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listProgressNotesForStudent: listProgressNotesForStudentMock,
}));

type StudentProgressPageModule = {
  default: (props: {
    searchParams?:
      | Promise<{
          performanceLevel?: string;
          search?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
        }>
      | {
          performanceLevel?: string;
          search?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
        };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/progress/page.tsx";

async function loadStudentProgressPage() {
  const specifier = "@/app/portal/student/progress/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentProgressPageModule>;
}

function progressNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "progress-1",
    archivedAt: null,
    content: "Strong algebra reasoning and improved independent revision.",
    performanceLevel: "GOOD",
    recordedAt: "2026-06-01T10:00:00.000Z",
    statusLabel: "Active",
    subject: { id: "subject-math", name: "Mathematics" },
    teacher: { id: "teacher-1", name: "Jane Teacher" },
    teacherName: "Jane Teacher",
    teacherNotes: "Strong algebra reasoning and improved independent revision.",
    updatedAt: "2026-06-02T10:30:00.000Z",
    ...overrides,
  };
}

describe("Student progress page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      email: "student@example.com",
      role: UserRole.STUDENT,
      uid: "student-1",
    });
    listProgressNotesForStudentMock.mockResolvedValue([progressNote()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the STUDENT guard, dedicated progress repository, and no direct Prisma query", () => {
    expect(existsSync(PAGE_SOURCE_PATH), "student progress page should exist").toBe(true);

    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("listProgressNotesForStudent");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("requires STUDENT and forwards progress filters using session.uid", async () => {
    const page = await loadStudentProgressPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        performanceLevel: "GOOD",
        search: "algebra",
        sort: "teacher",
        status: "all",
        subjectId: "subject-math",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listProgressNotesForStudentMock).toHaveBeenCalledWith("student-1", {
      performanceLevel: "GOOD",
      search: "algebra",
      sort: "teacher",
      status: "all",
      subjectId: "subject-math",
    });
  });

  it("renders filters, progress notes, teacher, dates, and active/archived status", async () => {
    const page = await loadStudentProgressPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /^progress$/i })).toBeDefined();
    expect(screen.getByLabelText("Subject")).toBeDefined();
    expect(screen.getByLabelText("Performance level")).toBeDefined();
    expect(screen.getByLabelText("Status")).toBeDefined();
    expect(screen.getByLabelText("Search")).toBeDefined();
    expect(screen.getByLabelText("Sort")).toBeDefined();

    const row = screen.getByRole("article", { name: /mathematics/i });
    expect(within(row).getByText(/^Subject:\s*Mathematics$/i)).toBeDefined();
    expect(within(row).getByText(/performance:\s*good/i)).toBeDefined();
    expect(within(row).getByText(/strong algebra reasoning/i)).toBeDefined();
    expect(within(row).getByText(/jane teacher/i)).toBeDefined();
    expect(within(row).getByText(/recorded/i)).toBeDefined();
    expect(within(row).getByText(/updated/i)).toBeDefined();
    expect(within(row).getByText(/active/i)).toBeDefined();
    expect(screen.queryByText(/foreign student progress/i)).toBeNull();
  });

  it("shows distinct empty states for unfiltered and filtered progress lists", async () => {
    listProgressNotesForStudentMock.mockResolvedValueOnce([]);

    const page = await loadStudentProgressPage();
    const unfiltered = await page.default({ searchParams: {} });
    const { unmount } = render(unfiltered);

    expect(screen.getByText("No progress notes yet.")).toBeDefined();
    unmount();

    listProgressNotesForStudentMock.mockResolvedValueOnce([]);
    const filtered = await page.default({ searchParams: { search: "missing" } });
    render(filtered);

    expect(screen.getByText("No progress notes match the selected filters.")).toBeDefined();
  });

  it.each([UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading student progress",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadStudentProgressPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
      expect(listProgressNotesForStudentMock).not.toHaveBeenCalled();
    },
  );
});
