import { UserRole } from "@prisma/client";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherDashboardDataMock = vi.hoisted(() => vi.fn());
const countUnreadNotificationsForUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getTeacherDashboardData: getTeacherDashboardDataMock,
}));

vi.mock("@/lib/repositories/notification-repository", () => ({
  countUnreadNotificationsForUser: countUnreadNotificationsForUserMock,
}));

vi.mock("@/app/portal/actions", () => ({
  gradeHomeworkAction: vi.fn(),
}));

import TeacherDashboardPage from "@/app/portal/teacher/page";

const fullMonthDateRegex =
  /\b\d{2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/;
const twelveHourTimeRegex = /\b\d{1,2}:\d{2} (AM|PM)\b/;
const shortMonthRegex = /\b\d{2} (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/;
const bareTwentyFourHourTimeRegex = /\b([01]?\d|2[0-3]):\d{2}\b(?!\s?(AM|PM))/;

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

describe("Teacher dashboard formatting consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    countUnreadNotificationsForUserMock.mockResolvedValue(0);
    getTeacherDashboardDataMock.mockResolvedValue({
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
          id: "lesson-today",
          title: "Today IGCSE Mathematics",
          studentCount: 12,
          startAt: new Date("2026-06-06T11:00:00.000Z"),
          endAt: new Date("2026-06-06T12:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/today",
          timezone: "Europe/Kiev",
          status: "SCHEDULED",
        },
      ],
      upcomingLessons: [
        {
          id: "lesson-1",
          title: "IGCSE Mathematics - Algebra",
          studentCount: 12,
          startAt: new Date("2026-06-06T11:00:00.000Z"),
          endAt: new Date("2026-06-06T12:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/lesson-1",
          timezone: "Europe/Kiev",
        },
      ],
      pastLessons: [
        {
          id: "lesson-past",
          title: "Past IGCSE Mathematics",
          studentCount: 12,
          startAt: new Date("2026-06-04T11:00:00.000Z"),
          endAt: new Date("2026-06-04T12:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/past",
          timezone: "Europe/Kiev",
          status: "COMPLETED",
        },
      ],
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
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders class and lesson dates with full month names instead of abbreviated month strings", async () => {
    const { container } = await renderServerComponent(<TeacherDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(fullMonthDateRegex);
    expect(text).not.toMatch(shortMonthRegex);
  });

  it("renders class and lesson times in one consistent 12-hour format", async () => {
    const { container } = await renderServerComponent(<TeacherDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(twelveHourTimeRegex);
    expect(text).not.toMatch(bareTwentyFourHourTimeRegex);
  });

  it("formats assignment due dates and submission timestamps in the same full-date style", async () => {
    const { container } = await renderServerComponent(<TeacherDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(
      /Due:\s+\d{2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/,
    );
    expect(text).toMatch(
      /Submitted:\s+\d{2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/,
    );
    expect(text).not.toMatch(/Due:\s+\d{2} (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/);
  });

  it("renders lesson times with the teacher dashboard timezone label", async () => {
    const { container } = await renderServerComponent(<TeacherDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/Europe\/Kiev/);
  });

  it("does not expose unsafe meeting URLs as visible dashboard card text or links", async () => {
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      metrics: {
        myClasses: 0,
        activeAssignments: 0,
        pendingSubmissions: 0,
        upcomingLessons: 1,
      },
      classes: [],
      todayLessons: [],
      upcomingLessons: [
        {
          id: "lesson-unsafe",
          title: "Unsafe meeting URL",
          studentCount: 12,
          startAt: new Date("2026-06-06T11:00:00.000Z"),
          endAt: new Date("2026-06-06T12:00:00.000Z"),
          liveLessonUrl: "javascript:alert(1)",
          timezone: "Europe/Kiev",
          status: "SCHEDULED",
          startState: { canStart: false, label: "Meeting link missing" },
        },
      ],
      pastLessons: [],
      activeAssignments: [],
      recentPendingSubmissions: [],
      pendingSubmissions: [],
    });

    const { container } = await renderServerComponent(<TeacherDashboardPage />);

    expect(container.textContent ?? "").not.toContain("javascript:alert(1)");
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
