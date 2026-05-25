import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherStudentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listTeacherStudentsForProgress: listTeacherStudentsMock,
}));

type TeacherStudentsPageModule = {
  default: () => Promise<ReactElement> | ReactElement;
};

async function loadTeacherStudentsPage() {
  const specifier = "@/app/portal/teacher/students/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherStudentsPageModule>;
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    fullName: "Amina Yusuf",
    email: "amina@example.com",
    learningStatus: "ACTIVE",
    href: "/portal/teacher/students/student-1",
    ownershipPaths: ["DIRECT_LESSON"],
    ...overrides,
  };
}

describe("Teacher students list page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listTeacherStudentsMock.mockResolvedValue([student()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("requires TEACHER and lists only repository-scoped assigned students", async () => {
    const page = await loadTeacherStudentsPage();
    const element = await page.default();
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherStudentsMock).toHaveBeenCalledWith("teacher-1");
    expect(screen.getByRole("heading", { name: /students/i })).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/amina@example\.com/i)).toBeDefined();
    expect(screen.getByText(/active/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /amina yusuf|open student/i })).toHaveAttribute(
      "href",
      "/portal/teacher/students/student-1",
    );
  });

  it("does not render other teacher students when repository excludes them", async () => {
    listTeacherStudentsMock.mockResolvedValueOnce([
      student(),
      student({
        id: "student-2",
        fullName: "Daniel Mwangi",
        email: "daniel@example.com",
        href: "/portal/teacher/students/student-2",
      }),
    ]);

    const page = await loadTeacherStudentsPage();
    const element = await page.default();
    render(element);

    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/daniel mwangi/i)).toBeDefined();
    expect(screen.queryByText(/foreign student/i)).toBeNull();
  });

  it("renders an empty state when the teacher has no assigned students", async () => {
    listTeacherStudentsMock.mockResolvedValueOnce([]);

    const page = await loadTeacherStudentsPage();
    const element = await page.default();
    render(element);

    expect(screen.getByText(/no assigned students|no students/i)).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading students",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherStudentsPage();

      await expect(page.default()).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listTeacherStudentsMock).not.toHaveBeenCalled();
    },
  );
});
