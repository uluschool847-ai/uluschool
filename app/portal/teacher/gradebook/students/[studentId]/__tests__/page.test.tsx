import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getTeacherStudentGradebookMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getTeacherStudentGradebook: getTeacherStudentGradebookMock,
}));

type StudentGradebookPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadStudentGradebookPage() {
  const specifier = "@/app/portal/teacher/gradebook/students/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentGradebookPageModule>;
}

function gradebook(overrides: Record<string, unknown> = {}) {
  return {
    categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
    homeworkGrades: [{ id: "submission-1", score: 80, title: "Quadratics homework" }],
    manualGradeHistory: [
      {
        id: "manual-archived",
        archivedAt: new Date("2026-04-01T00:00:00.000Z"),
        score: 50,
        title: "Archived oral checkpoint",
      },
    ],
    manualGrades: [{ id: "manual-1", archivedAt: null, score: 90, title: "Oral checkpoint" }],
    student: { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
    term: { id: "term-1", name: "Spring 2026" },
    termAverage: 83,
    ...overrides,
  };
}

describe("Teacher student gradebook page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    getTeacherStudentGradebookMock.mockResolvedValue(gradebook());
  });

  afterEach(() => cleanup());

  it("uses repository ownership and no direct Prisma query", () => {
    const source = readFileSync(
      "app/portal/teacher/gradebook/students/[studentId]/page.tsx",
      "utf8",
    );

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("getTeacherStudentGradebook");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders homework grades, manual grades, archived history, and term average", async () => {
    const page = await loadStudentGradebookPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { termId: "term-1" },
    });
    render(element);

    expect(getTeacherStudentGradebookMock).toHaveBeenCalledWith("teacher-1", "student-1", "term-1");
    expect(screen.getByRole("heading", { name: /amina yusuf gradebook/i })).toBeDefined();
    expect(screen.getByText(/quadratics homework/i)).toBeDefined();
    expect(screen.getByText(/homework/i)).toBeDefined();
    expect(screen.getByText(/oral checkpoint/i)).toBeDefined();
    expect(screen.getByText(/manual/i)).toBeDefined();
    expect(screen.getByText(/term average:\s*83/i)).toBeDefined();
    expect(screen.getByText(/archived oral checkpoint/i)).toBeDefined();
    expect(screen.getByText(/archived/i)).toBeDefined();
  });

  it("returns notFound for foreign or missing students", async () => {
    getTeacherStudentGradebookMock.mockResolvedValueOnce(null);
    const page = await loadStudentGradebookPage();

    await expect(
      page.default({
        params: { studentId: "foreign-student" },
        searchParams: { termId: "term-1" },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
