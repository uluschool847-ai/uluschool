import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherStudentDetailMock = vi.hoisted(() => vi.fn());
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
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type TeacherStudentDetailPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
  }) => Promise<ReactElement> | ReactElement;
};

async function loadTeacherStudentDetailPage() {
  const specifier = "@/app/portal/teacher/students/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherStudentDetailPageModule>;
}

function assignedStudent() {
  return {
    id: "student-1",
    fullName: "Amina Yusuf",
    email: "amina@example.com",
    learningStatus: "ACTIVE",
    classGroups: [
      { id: "group-1", name: "Algebra Group A", href: "/portal/teacher/classes/group-1" },
    ],
    upcomingLessons: [
      {
        id: "lesson-upcoming",
        title: "Quadratics",
        href: "/portal/teacher/lessons/lesson-upcoming",
      },
    ],
    pastLessons: [
      {
        id: "lesson-past",
        title: "Linear review",
        href: "/portal/teacher/lessons/lesson-past",
      },
    ],
    progressSummary: {
      totalNotes: 2,
      latestPerformanceLevel: "GOOD",
    },
    progressHref: "/portal/teacher/students/student-1/progress",
  };
}

describe("Teacher student detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getTeacherStudentDetailMock.mockResolvedValue(assignedStudent());
  });

  afterEach(() => {
    cleanup();
  });

  it("requires TEACHER and renders assigned student context", async () => {
    const page = await loadTeacherStudentDetailPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherStudentDetailMock).toHaveBeenCalledWith("teacher-1", "student-1");
    expect(screen.getByRole("heading", { name: /amina yusuf/i })).toBeDefined();
    expect(screen.getByText(/amina@example\.com/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/quadratics/i)).toBeDefined();
    expect(screen.getByText(/linear review/i)).toBeDefined();
    expect(screen.getByText(/progress summary/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /progress/i })).toHaveAttribute(
      "href",
      "/portal/teacher/students/student-1/progress",
    );
  });

  it("returns notFound for an unassigned student", async () => {
    getTeacherStudentDetailMock.mockResolvedValueOnce(null);
    const page = await loadTeacherStudentDetailPage();

    await expect(page.default({ params: { studentId: "student-foreign" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getTeacherStudentDetailMock).toHaveBeenCalledWith("teacher-1", "student-foreign");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading student detail",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadTeacherStudentDetailPage();

      await expect(page.default({ params: { studentId: "student-1" } })).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(getTeacherStudentDetailMock).not.toHaveBeenCalled();
    },
  );
});
