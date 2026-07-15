import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TeacherSchedulePage from "@/app/portal/teacher/schedule/page";
import {
  TeacherLessonDetail,
  TeacherScheduleFilters,
  getDateRange,
} from "@/components/portal/teacher-schedule-display";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherScheduleMock = vi.hoisted(() => vi.fn());
const getTeacherScheduleFilterOptionsMock = vi.hoisted(() => vi.fn());
const canStartLessonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-schedule-repository", () => ({
  listTeacherSchedule: listTeacherScheduleMock,
  getTeacherScheduleFilterOptions: getTeacherScheduleFilterOptionsMock,
  canStartLesson: canStartLessonMock,
}));

const filterOptions = {
  classGroups: [],
  subjects: [],
};

const lesson = {
  id: "lesson-1",
  title: "Nairobi timezone lesson",
  description: null,
  status: "SCHEDULED",
  startAt: new Date("2026-06-30T21:00:00.000Z"),
  endAt: new Date("2026-06-30T22:00:00.000Z"),
  timezone: "Africa/Nairobi",
  liveLessonUrl: null,
  meetingProvider: "GOOGLE_MEET",
  googleCalendarEventId: null,
  googleMeetSpaceName: null,
  meetingUpdatedAt: null,
  subject: null,
  classGroup: null,
  cancelReason: null,
  rescheduledFromId: null,
  studentCount: 0,
  rosterPreview: [],
  materialsCount: 0,
  materials: [],
  assignmentsCount: 1,
  assignments: [
    {
      id: "assignment-1",
      title: "Nairobi due date",
      dueDate: new Date("2026-06-30T21:00:00.000Z"),
      submissionCount: 0,
      pendingSubmissionCount: 0,
    },
  ],
  pendingSubmissionsCount: 0,
  submissionsSummary: { total: 0, pending: 0, graded: 0 },
  progressHref: "/portal/teacher/progress?lessonId=lesson-1",
};

describe("teacher schedule Nairobi timezone behavior", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.stubEnv("TZ", "Europe/Berlin");
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getTeacherScheduleFilterOptionsMock.mockResolvedValue(filterOptions);
    listTeacherScheduleMock.mockResolvedValue([]);
    canStartLessonMock.mockReturnValue({
      enabled: false,
      href: null,
      reason: "Available before lesson",
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("maps selected Nairobi calendar dates to exact UTC day boundaries and retains the six-month bound", () => {
    const range = getDateRange("2026-07-01", "2026-07-31");

    expect(range.from).toEqual(new Date("2026-06-30T21:00:00.000Z"));
    expect(range.to).toEqual(new Date("2026-07-31T20:59:59.999Z"));

    const bounded = getDateRange("2026-07-01", "2027-12-31");
    expect(bounded.to).toEqual(new Date("2027-01-01T20:59:59.999Z"));
    expect(bounded.toValue).toBe("2027-01-01");
    expect(bounded.messages).toContain("Date range was limited. Maximum range is 6 months.");
  });

  it("derives the default month and quick ranges from Nairobi's current calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T21:30:00.000Z"));

    const range = getDateRange();
    expect(range.fromValue).toBe("2026-07-01");
    expect(range.toValue).toBe("2026-07-31");

    render(
      <TeacherScheduleFilters from={range.fromValue} to={range.toValue} options={filterOptions} />,
    );

    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?from=2026-07-01&to=2026-07-01",
    );
    expect(screen.getByRole("link", { name: "This Week" })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?from=2026-06-29&to=2026-07-05",
    );
    expect(screen.getByRole("link", { name: "This Month" })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?from=2026-07-01&to=2026-07-31",
    );
    expect(screen.getByRole("link", { name: "Next 7 Days" })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?from=2026-07-01&to=2026-07-07",
    );
  });

  it("formats lesson and due-date labels in Nairobi regardless of the process timezone", () => {
    render(<TeacherLessonDetail lesson={lesson} startState={canStartLessonMock()} />);

    expect(screen.getByText("Date/time: 01 Jul 2026 00:00 - 01:00")).toBeDefined();
    expect(screen.getByText("Due: 01 Jul 2026")).toBeDefined();
  });

  it("shows the selected range header using Nairobi calendar dates", async () => {
    const element = await TeacherSchedulePage({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });

    render(element);

    expect(screen.getByText("Lessons from 01 Jul 2026 to 31 Jul 2026.")).toBeDefined();
  });
});
