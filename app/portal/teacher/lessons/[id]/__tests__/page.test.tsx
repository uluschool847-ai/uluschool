import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherLessonWorkspaceMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-lesson-workspace-repository", () => ({
  getTeacherLessonWorkspace: getTeacherLessonWorkspaceMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type TeacherLessonDetailPageModule = {
  default: (props: {
    params: Promise<{ lessonId: string }> | { lessonId: string };
  }) => Promise<ReactElement> | ReactElement;
};

async function loadTeacherLessonDetailPage() {
  const specifier = "@/app/portal/teacher/lessons/[lessonId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherLessonDetailPageModule>;
}

function workspaceRecord() {
  return {
    lesson: {
      id: "lesson-1",
      title: "Quadratic functions",
      description: "Live problem-solving session",
      startAt: new Date("2026-06-01T10:00:00.000Z"),
      endAt: new Date("2026-06-01T11:00:00.000Z"),
      timezone: "Europe/Kiev",
      status: "SCHEDULED",
      cancelReason: null,
      rescheduledFromId: null,
      isRescheduled: false,
      liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      startState: {
        enabled: true,
        href: "https://meet.google.com/abc-defg-hij",
        reason: null,
      },
    },
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    classGroup: {
      id: "group-1",
      name: "IGCSE Mathematics Group A",
      status: "ACTIVE",
      href: "/portal/teacher/classes/group-1",
    },
    navigationHrefs: {
      backToSchedule: "/portal/teacher/schedule",
      classDetail: "/portal/teacher/classes/group-1",
      submissions: {
        disabled: true,
        href: null,
        reason: "Teacher submissions route is not implemented",
      },
      progress: {
        disabled: true,
        href: null,
        reason: "Teacher progress route is not implemented",
      },
      materials: {
        disabled: true,
        href: null,
        reason: "Teacher materials route is not implemented",
      },
      attendance: {
        disabled: true,
        href: null,
        reason: "Attendance module is not implemented",
      },
    },
    roster: [
      {
        id: "student-1",
        fullName: "Sofia Shevchenko",
        email: "sofia@example.com",
        isActive: true,
        learningStatus: null,
        submissionStatus: "pending",
      },
      {
        id: "student-2",
        fullName: "Mark Shevchenko",
        email: "mark@example.com",
        isActive: true,
        learningStatus: null,
        submissionStatus: "graded",
      },
    ],
    materials: [
      {
        id: "material-1",
        title: "Quadratics worksheet",
        description: null,
        fileUrl: "https://example.com/ws.pdf",
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        fileLink: {
          disabled: false,
          href: "https://example.com/ws.pdf",
          label: "Open Quadratics worksheet",
        },
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Quadratics homework",
        dueDate: new Date("2026-06-05T00:00:00.000Z"),
        isArchived: false,
        dueState: "due-soon",
        submissionsCount: 2,
        pendingSubmissionsCount: 1,
        review: {
          disabled: true,
          href: null,
          reason: "Teacher submissions route is not implemented",
        },
      },
    ],
    submissions: [],
    gradingSummary: {
      totalSubmissions: 2,
      pendingSubmissions: 1,
      gradedSubmissions: 1,
    },
    progressSummary: {
      disabled: true,
      href: null,
      count: 0,
      reason: "Teacher progress route is not implemented",
    },
    attendanceSummary: {
      disabled: true,
      hidden: true,
      reason: "Attendance module is not implemented",
    },
  };
}

describe("Teacher lesson detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires teacher ownership and renders lesson detail, roster, resources, and shortcuts", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(workspaceRecord());

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "lesson-1");
    expect(screen.getByRole("heading", { name: /quadratic functions/i })).toBeDefined();
    expect(screen.getByText(/live problem-solving session/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
    expect(screen.getAllByText(/mathematics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/scheduled/i)).toBeDefined();
    expect(screen.queryByText("https://meet.google.com/abc-defg-hij")).toBeNull();
    expect(screen.getByText(/sofia shevchenko/i)).toBeDefined();
    expect(screen.getByText(/mark shevchenko/i)).toBeDefined();
    expect(screen.getAllByText(/quadratics worksheet/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/quadratics homework/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 submissions/i)).toBeDefined();
    expect(screen.getByText(/1 pending/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /progress notes/i })).toBeDefined();
    expect(screen.getByText(/teacher progress route is not implemented/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /start lesson/i })).toHaveProperty(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("calls notFound when an unrelated teacher tries to access the lesson", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(null);

    const page = await loadTeacherLessonDetailPage();

    await expect(page.default({ params: { lessonId: "lesson-1" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "lesson-1");
    expect(notFound).toHaveBeenCalled();
  });
});
