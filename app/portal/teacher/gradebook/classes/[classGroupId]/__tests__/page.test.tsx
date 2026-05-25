import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getTeacherClassGroupGradebookMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getTeacherClassGroupGradebook: getTeacherClassGroupGradebookMock,
}));

type ClassGradebookPageModule = {
  default: (props: {
    params: Promise<{ classGroupId: string }> | { classGroupId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadClassGradebookPage() {
  const specifier = "@/app/portal/teacher/gradebook/classes/[classGroupId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGradebookPageModule>;
}

function gradebook(overrides: Record<string, unknown> = {}) {
  return {
    categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    rows: [
      {
        student: { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
        homeworkAverage: 80,
        manualAverage: 90,
        termAverage: 83,
        studentGradebookHref: "/portal/teacher/gradebook/students/student-1?termId=term-1",
      },
    ],
    term: { id: "term-1", name: "Spring 2026" },
    ...overrides,
  };
}

describe("Teacher class group gradebook page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    getTeacherClassGroupGradebookMock.mockResolvedValue(gradebook());
  });

  afterEach(() => cleanup());

  it("uses the repository and no direct Prisma query", () => {
    const source = readFileSync(
      "app/portal/teacher/gradebook/classes/[classGroupId]/page.tsx",
      "utf8",
    );

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("getTeacherClassGroupGradebook");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders homework, manual, and weighted term averages for scoped students", async () => {
    const page = await loadClassGradebookPage();
    const element = await page.default({
      params: { classGroupId: "group-1" },
      searchParams: { termId: "term-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherClassGroupGradebookMock).toHaveBeenCalledWith(
      "teacher-1",
      "group-1",
      "term-1",
    );
    expect(screen.getByRole("heading", { name: /algebra group a gradebook/i })).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByText(/homework weight:\s*70/i)).toBeDefined();
    expect(screen.getByText(/manual weight:\s*30/i)).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/homework average:\s*80/i)).toBeDefined();
    expect(screen.getByText(/manual average:\s*90/i)).toBeDefined();
    expect(screen.getByText(/term average:\s*83/i)).toBeDefined();
  });

  it("returns notFound for foreign or missing class groups", async () => {
    getTeacherClassGroupGradebookMock.mockResolvedValueOnce(null);
    const page = await loadClassGradebookPage();

    await expect(
      page.default({
        params: { classGroupId: "foreign-group" },
        searchParams: { termId: "term-1" },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
