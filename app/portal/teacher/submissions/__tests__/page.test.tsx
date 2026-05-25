import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listSubmissionsForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  listSubmissionsForTeacher: listSubmissionsForTeacherMock,
}));

type TeacherSubmissionsPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/submissions/page.tsx";

async function loadTeacherSubmissionsPage() {
  const specifier = "@/app/portal/teacher/submissions/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherSubmissionsPageModule>;
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    assignmentTitle: "Quadratic homework",
    classGroup: { id: "group-1", name: "Algebra Group A" },
    contentUrl: "https://uploads.example/submissions/quadratic.pdf",
    feedbackPreview: null,
    grade: null,
    reviewHref: null,
    status: "Pending",
    student: {
      email: "amina@example.com",
      fullName: "Amina Yusuf",
      id: "student-1",
    },
    subject: { id: "subject-1", name: "Algebra" },
    submittedAt: new Date("2026-07-10T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Teacher submissions page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listSubmissionsForTeacherMock.mockResolvedValue([submission()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the enum-based TEACHER page guard and repository-driven list API", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/submission-repository");
    expect(source).toContain("listSubmissionsForTeacher");
    expect(source).not.toContain('requireRole(["TEACHER"])');
    expect(source).not.toContain("requireRole(['TEACHER'])");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("requires TEACHER and forwards all supported filters to listSubmissionsForTeacher", async () => {
    const page = await loadTeacherSubmissionsPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        assignmentId: "assignment-1",
        classGroupId: "group-1",
        scheduledClassId: "lesson-1",
        search: "amina quadratic",
        sort: "studentName",
        status: "pending",
        studentId: "student-1",
        subjectId: "subject-1",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listSubmissionsForTeacherMock).toHaveBeenCalledWith("teacher-1", {
      assignmentId: "assignment-1",
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "amina quadratic",
      sort: "studentName",
      status: "pending",
      studentId: "student-1",
      subjectId: "subject-1",
    });
  });

  it("renders filters, scoped rows, status, safe content links, and grading action labels", async () => {
    const page = await loadTeacherSubmissionsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /submissions/i })).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/class group/i)).toBeDefined();
    expect(screen.getByLabelText(/lesson|scheduled class/i)).toBeDefined();
    expect(screen.getByLabelText(/assignment/i)).toBeDefined();
    expect(screen.getByLabelText(/student/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/search/i)).toBeDefined();
    expect(screen.getByLabelText(/sort/i)).toBeDefined();

    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/amina@example\.com/i)).toBeDefined();
    expect(screen.getByText(/quadratic homework/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/^algebra$/i)).toBeDefined();
    expect(screen.getByText(/pending/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view submission/i })).toHaveAttribute(
      "href",
      "https://uploads.example/submissions/quadratic.pdf",
    );
    expect(screen.getByRole("button", { name: /^grade$/i })).toBeDefined();
  });

  it("renders an empty state when the teacher has no scoped submissions", async () => {
    listSubmissionsForTeacherMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSubmissionsPage();
    const element = await page.default({ searchParams: { status: "pending" } });
    render(element);

    expect(screen.getByText(/no submissions found/i)).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions at the page guard",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherSubmissionsPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(listSubmissionsForTeacherMock).not.toHaveBeenCalled();
    },
  );

  it("keeps dashboard, class detail, and lesson workspace navigation wired to the submissions route", () => {
    const dashboardSource = readFileSync("app/portal/teacher/page.tsx", "utf8");
    const classDetailSource = readFileSync(
      "app/portal/teacher/classes/[classGroupId]/page.tsx",
      "utf8",
    );
    const lessonWorkspaceSource = readFileSync(
      "app/portal/teacher/lessons/[lessonId]/page.tsx",
      "utf8",
    );

    expect(dashboardSource).toContain("/portal/teacher/submissions");
    expect(classDetailSource).toContain("/portal/teacher/submissions?classGroupId=");
    expect(lessonWorkspaceSource).not.toContain("Teacher submissions route is not implemented");
    expect(lessonWorkspaceSource).toMatch(
      /\/portal\/teacher\/submissions\?(scheduledClassId|assignmentId)=/,
    );
  });
});
