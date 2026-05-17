import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherScheduleMock = vi.hoisted(() => vi.fn());
const getTeacherScheduleFilterOptionsMock = vi.hoisted(() => vi.fn());
const getTeacherScheduleLessonMock = vi.hoisted(() => vi.fn());
const getTeacherLessonWorkspaceMock = vi.hoisted(() => vi.fn());
const canStartLessonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-schedule-repository", () => ({
  listTeacherSchedule: listTeacherScheduleMock,
  getTeacherScheduleFilterOptions: getTeacherScheduleFilterOptionsMock,
  getTeacherScheduleLesson: getTeacherScheduleLessonMock,
  canStartLesson: canStartLessonMock,
}));

vi.mock("@/lib/repositories/teacher-lesson-workspace-repository", () => ({
  getTeacherLessonWorkspace: getTeacherLessonWorkspaceMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

type TeacherSchedulePageModule = {
  default: (props: {
    searchParams?: Promise<{
      from?: string;
      to?: string;
      classGroupId?: string;
      subjectId?: string;
      status?: LessonStatus;
    }>;
  }) => Promise<ReactElement> | ReactElement;
};

type TeacherLessonDetailPageModule = {
  default: (props: {
    params: Promise<{ lessonId: string }> | { lessonId: string };
  }) => Promise<ReactElement> | ReactElement;
};

async function loadTeacherSchedulePage() {
  const specifier = "@/app/portal/teacher/schedule/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherSchedulePageModule>;
}

async function loadTeacherLessonDetailPage() {
  const specifier = "@/app/portal/teacher/lessons/[lessonId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherLessonDetailPageModule>;
}

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Teacher live lesson",
    description: "Teacher live URL safety lesson",
    status: "SCHEDULED",
    startAt: new Date("2026-07-01T10:00:00.000Z"),
    endAt: new Date("2026-07-01T11:00:00.000Z"),
    timezone: "Europe/Kiev",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    meetingUpdatedAt: new Date("2026-07-01T08:00:00.000Z"),
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    cancelReason: null,
    rescheduledFromId: null,
    studentCount: 1,
    rosterPreview: [
      { id: "student-1", fullName: "Active Student", email: "active@example.com", isActive: true },
    ],
    materialsCount: 0,
    materials: [],
    assignmentsCount: 0,
    assignments: [],
    pendingSubmissionsCount: 0,
    submissionsSummary: { total: 0, pending: 0, graded: 0 },
    ...overrides,
  };
}

function cardFor(title: string) {
  const card = screen.getByText(title).closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

function workspaceRecord(overrides: Record<string, unknown> = {}) {
  return {
    lesson: {
      id: "lesson-1",
      title: "Teacher live lesson",
      description: "Teacher live URL safety lesson",
      status: "SCHEDULED",
      startAt: new Date("2026-07-01T10:00:00.000Z"),
      endAt: new Date("2026-07-01T11:00:00.000Z"),
      timezone: "Europe/Kiev",
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
      name: "Algebra Group A",
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
    roster: [],
    materials: [],
    assignments: [],
    submissions: [],
    gradingSummary: {
      totalSubmissions: 0,
      pendingSubmissions: 0,
      gradedSubmissions: 0,
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
    ...overrides,
  };
}

describe("Teacher schedule live lesson URL behavior", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T10:15:00.000Z"));
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getTeacherScheduleFilterOptionsMock.mockResolvedValue({
      classGroups: [{ id: "group-1", name: "Algebra Group A" }],
      subjects: [{ id: "subject-math", name: "Mathematics" }],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders a valid joinable Google Meet lesson as a safe external Start lesson link", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([lessonRecord()]);
    canStartLessonMock.mockReturnValueOnce({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    const card = cardFor("Teacher live lesson");
    const link = within(card).getByRole("link", { name: /start lesson/i });
    expect(link.getAttribute("href")).toBe("https://meet.google.com/abc-defg-hij");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(canStartLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/abc-defg-hij",
        meetingUpdatedAt: new Date("2026-07-01T08:00:00.000Z"),
      }),
      expect.any(Date),
    );
  });

  it("passes provider metadata to the shared start-state helper for provider-aware validation", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        title: "Teacher wrong provider lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "GOOGLE_MEET",
      }),
    ]);
    canStartLessonMock.mockReturnValueOnce({
      enabled: false,
      href: null,
      reason: "Invalid meeting link",
    });

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    const card = cardFor("Teacher wrong provider lesson");
    expect(within(card).queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(card.textContent ?? "").toMatch(/invalid meeting link/i);
    expect(canStartLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "GOOGLE_MEET",
      }),
      expect.any(Date),
    );
  });

  it.each([
    {
      title: "Teacher missing URL lesson",
      lesson: lessonRecord({ title: "Teacher missing URL lesson", liveLessonUrl: null }),
      state: { enabled: false, href: null, reason: "Meeting link missing" },
      text: /meeting link missing/i,
    },
    {
      title: "Teacher cancelled lesson",
      lesson: lessonRecord({ title: "Teacher cancelled lesson", status: "CANCELLED" }),
      state: { enabled: false, href: null, reason: "Lesson cancelled" },
      text: /lesson cancelled/i,
    },
    {
      title: "Teacher completed lesson",
      lesson: lessonRecord({ title: "Teacher completed lesson", status: "COMPLETED" }),
      state: { enabled: false, href: null, reason: "Lesson completed" },
      text: /lesson completed/i,
    },
  ])("does not render an active Start link for $title", async ({ title, lesson, state, text }) => {
    listTeacherScheduleMock.mockResolvedValueOnce([lesson]);
    canStartLessonMock.mockReturnValueOnce(state);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    const card = cardFor(title);
    expect(within(card).queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(card.textContent ?? "").toMatch(text);
  });

  it("does not render an unsafe URL from schedule data as an active Start link", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        title: "Teacher unsafe URL lesson",
        liveLessonUrl: "data:text/html,<script>alert(1)</script>",
      }),
    ]);
    canStartLessonMock.mockReturnValueOnce({
      enabled: true,
      href: "data:text/html,<script>alert(1)</script>",
      reason: null,
    });

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    const card = cardFor("Teacher unsafe URL lesson");
    expect(within(card).queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(card.textContent ?? "").toMatch(/meeting link missing|invalid meeting link/i);
  });

  it("uses the same safe link behavior on the teacher lesson detail workspace", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
      workspaceRecord({
        lesson: {
          ...workspaceRecord().lesson,
          id: "unsafe-detail",
          title: "Teacher unsafe detail lesson",
          liveLessonUrl: "javascript:alert(1)",
          startState: { enabled: false, href: null, reason: "Meeting link missing" },
        },
      }),
    );

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "unsafe-detail" } });
    render(element);

    expect(screen.queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(screen.getByText(/meeting link missing|invalid meeting link/i)).toBeDefined();
  });

  it("uses the shared TeacherStartLessonButton contract for schedule Start Lesson rendering", () => {
    const source = readFileSync("components/portal/teacher-schedule-display.tsx", "utf8");

    expect(source).toContain("TeacherStartLessonButton");
    expect(source).not.toMatch(/export function StartLessonControl/);
    expect(source).not.toMatch(/validateLiveLessonUrl\([^)]*"MANUAL_URL"/);
  });
});
