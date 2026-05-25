import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAcademicTermsMock = vi.hoisted(() => vi.fn());
const listTeacherGradebookOverviewMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  listAcademicTerms: listAcademicTermsMock,
  listTeacherGradebookOverview: listTeacherGradebookOverviewMock,
}));

type TeacherGradebookPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadTeacherGradebookPage() {
  const specifier = "@/app/portal/teacher/gradebook/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherGradebookPageModule>;
}

describe("Teacher gradebook index page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listAcademicTermsMock.mockResolvedValue([
      { id: "term-1", name: "Spring 2026", isActive: true },
    ]);
    listTeacherGradebookOverviewMock.mockResolvedValue({
      classGroups: [
        {
          id: "group-1",
          name: "Algebra Group A",
          href: "/portal/teacher/gradebook/classes/group-1?termId=term-1",
          studentsCount: 2,
        },
      ],
      students: [
        {
          id: "student-1",
          fullName: "Amina Yusuf",
          email: "amina@example.com",
          href: "/portal/teacher/gradebook/students/student-1?termId=term-1",
        },
      ],
    });
  });

  afterEach(() => cleanup());

  it("uses TEACHER guard and repository-driven gradebook overview", () => {
    const source = readFileSync("app/portal/teacher/gradebook/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/gradebook-repository");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders active term filter and teacher-owned class/student entry points", async () => {
    const page = await loadTeacherGradebookPage();
    const element = await page.default({ searchParams: { termId: "term-1" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherGradebookOverviewMock).toHaveBeenCalledWith("teacher-1", {
      termId: "term-1",
    });
    expect(screen.getByRole("heading", { name: /gradebook/i })).toBeDefined();
    expect(screen.getByLabelText(/academic term/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /algebra group a/i })).toHaveAttribute(
      "href",
      "/portal/teacher/gradebook/classes/group-1?termId=term-1",
    );
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /amina yusuf/i })).toHaveAttribute(
      "href",
      "/portal/teacher/gradebook/students/student-1?termId=term-1",
    );
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadTeacherGradebookPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listTeacherGradebookOverviewMock).not.toHaveBeenCalled();
    },
  );
});
