import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherDashboardDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getTeacherDashboardData: getTeacherDashboardDataMock,
}));

vi.mock("@/app/portal/actions", () => ({
  gradeHomeworkAction: vi.fn(),
}));

import TeacherDashboardPage from "@/app/portal/teacher/page";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1024") ? width >= 1024 : width < 1024,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

describe("Teacher dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getTeacherDashboardDataMock.mockResolvedValue({
      metrics: {
        myClasses: 0,
        activeAssignments: 0,
        pendingSubmissions: 0,
        upcomingLessons: 0,
      },
      classes: [],
      todayLessons: [],
      upcomingLessons: [],
      pastLessons: [],
      activeAssignments: [],
      pendingSubmissions: [],
      recentPendingSubmissions: [],
      alerts: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("wraps the page in a main landmark and exposes a single h1", async () => {
    await renderServerComponent(<TeacherDashboardPage />);

    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("exposes empty widgets as independent status regions instead of silent blanks", async () => {
    await renderServerComponent(<TeacherDashboardPage />);

    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(3);
  });

  it("uses labeled section landmarks for metrics, teaching schedule, and grading regions", async () => {
    const { container } = await renderServerComponent(<TeacherDashboardPage />);

    const labeledSections = container.querySelectorAll(
      "section[aria-label], section[aria-labelledby]",
    );
    expect(labeledSections.length).toBeGreaterThanOrEqual(3);
  });

  it("stacks dashboard metric cards by default and only splits them from the small breakpoint", async () => {
    setViewport(375);
    const { container } = await renderServerComponent(<TeacherDashboardPage />);

    const metricsGrid = Array.from(container.querySelectorAll("section")).find((node) =>
      node.className.includes("sm:grid-cols-2"),
    );

    expect(metricsGrid).toBeTruthy();
    expect(metricsGrid?.className).not.toMatch(/(^|\s)grid-cols-4(\s|$)/);
  });

  it("exposes all major dashboard sections as accessible headings", async () => {
    await renderServerComponent(<TeacherDashboardPage />);

    for (const name of [
      /metrics/i,
      /today lessons/i,
      /upcoming lessons/i,
      /my classes\/groups/i,
      /grading workload/i,
      /^assignments$/i,
      /past lessons/i,
      /quick navigation/i,
    ]) {
      expect(screen.getByRole("heading", { name })).toBeDefined();
    }
  });

  it("uses clear action labels for lesson, review, and grading workflows", async () => {
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      metrics: {
        myClasses: 1,
        activeAssignments: 1,
        pendingSubmissions: 1,
        upcomingLessons: 1,
      },
      classes: [
        {
          id: "class-1",
          title: "IGCSE Mathematics - Group A",
          studentCount: 12,
          startAt: new Date("2026-06-05T09:00:00.000Z"),
          endAt: new Date("2026-06-05T10:30:00.000Z"),
        },
      ],
      todayLessons: [
        {
          id: "lesson-1",
          title: "IGCSE Mathematics - Algebra",
          studentCount: 12,
          startAt: new Date("2026-06-06T11:00:00.000Z"),
          endAt: new Date("2026-06-06T12:00:00.000Z"),
          liveLessonUrl: "https://meet.example.com/live/lesson-1",
          status: "SCHEDULED",
          startState: { canStart: true, label: "Start Lesson" },
        },
      ],
      upcomingLessons: [],
      pastLessons: [],
      activeAssignments: [
        {
          id: "assignment-1",
          title: "Algebra Homework",
          description: "Solve algebraic equations and submit full working.",
          dueDate: new Date("2026-06-07T00:00:00.000Z"),
          submissionCount: 4,
          pendingSubmissionCount: 2,
          scheduledClassTitle: "IGCSE Mathematics - Group A",
        },
      ],
      pendingSubmissions: [
        {
          id: "submission-1",
          studentName: "Student One",
          studentEmail: "student1@example.com",
          assignmentTitle: "Algebra Homework",
          classTitle: "IGCSE Mathematics - Group A",
          submittedAt: new Date("2026-06-06T13:45:00.000Z"),
          contentUrl: "https://example.com/submission-1",
          reviewHref: "/portal/teacher/lessons/lesson-1",
          score: null,
        },
      ],
      recentPendingSubmissions: [
        {
          id: "submission-1",
          studentName: "Student One",
          studentEmail: "student1@example.com",
          assignmentTitle: "Algebra Homework",
          classTitle: "IGCSE Mathematics - Group A",
          submittedAt: new Date("2026-06-06T13:45:00.000Z"),
          contentUrl: "https://example.com/submission-1",
        },
      ],
      alerts: [],
    });

    await renderServerComponent(<TeacherDashboardPage />);

    expect(screen.getByRole("link", { name: /start lesson/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /open details/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /^review$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /save grade/i })).toBeDefined();
  });
});
