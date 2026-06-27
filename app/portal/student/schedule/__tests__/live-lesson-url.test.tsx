import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listStudentScheduleMock = vi.hoisted(() => vi.fn());
const canJoinLessonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-schedule-repository", () => ({
  listStudentSchedule: listStudentScheduleMock,
  canJoinLesson: canJoinLessonMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

type StudentSchedulePageModule = {
  default: (props: {
    searchParams?: Promise<{
      month?: string;
      subjectId?: string;
      status?: LessonStatus;
    }>;
  }) => Promise<ReactElement> | ReactElement;
};

async function loadStudentSchedulePage() {
  const specifier = "@/app/portal/student/schedule/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentSchedulePageModule>;
}

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Algebra live lesson",
    description: "Live lesson URL safety lesson",
    status: "SCHEDULED",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
    teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
    cancelReason: null,
    rescheduledFromId: null,
    materialsCount: 0,
    materials: [],
    assignments: [],
    ...overrides,
  };
}

function cardFor(title: string) {
  const card = screen.getByText(title).closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("Student schedule live lesson URL behavior", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:15:00.000Z"));
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders a valid joinable Google Meet lesson as a safe external Join lesson link", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([lessonRecord()]);
    canJoinLessonMock.mockReturnValueOnce({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });

    const page = await loadStudentSchedulePage();
    const element = await page.default({ searchParams: Promise.resolve({ month: "2026-06" }) });
    render(element);

    const card = cardFor("Algebra live lesson");
    const link = within(card).getByRole("link", { name: /join lesson/i });
    expect(link.getAttribute("href")).toBe("https://meet.google.com/abc-defg-hij");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(within(card).queryByText("https://meet.google.com/abc-defg-hij")).toBeNull();
    expect(canJoinLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/abc-defg-hij",
        meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
      }),
      expect.any(Date),
    );
  });

  it("passes provider metadata to the shared join-state helper for provider-aware validation", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        title: "Wrong provider lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "GOOGLE_MEET",
      }),
    ]);
    canJoinLessonMock.mockReturnValueOnce({
      enabled: false,
      href: null,
      reason: "Invalid meeting link",
    });

    const page = await loadStudentSchedulePage();
    const element = await page.default({ searchParams: Promise.resolve({ month: "2026-06" }) });
    render(element);

    const card = cardFor("Wrong provider lesson");
    expect(within(card).queryByRole("link", { name: /join lesson/i })).toBeNull();
    expect(card.textContent ?? "").toMatch(/invalid meeting link/i);
    expect(canJoinLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "GOOGLE_MEET",
      }),
      expect.any(Date),
    );
  });

  it.each([
    {
      title: "Missing URL lesson",
      lesson: lessonRecord({ title: "Missing URL lesson", liveLessonUrl: null }),
      state: { enabled: false, href: null, reason: "Meeting link not available yet" },
      text: /meeting link not available yet/i,
    },
    {
      title: "Cancelled lesson",
      lesson: lessonRecord({ title: "Cancelled lesson", status: "CANCELLED" }),
      state: { enabled: false, href: null, reason: "Lesson cancelled" },
      text: /lesson cancelled/i,
    },
    {
      title: "Completed lesson",
      lesson: lessonRecord({ title: "Completed lesson", status: "COMPLETED" }),
      state: { enabled: false, href: null, reason: "Lesson completed" },
      text: /lesson completed/i,
    },
    {
      title: "Too early lesson",
      lesson: lessonRecord({
        title: "Too early lesson",
        startAt: new Date("2026-06-01T12:00:00.000Z"),
        endAt: new Date("2026-06-01T13:00:00.000Z"),
      }),
      state: { enabled: false, href: null, reason: "Available before lesson" },
      text: /available before lesson/i,
    },
  ])("does not render an active Join link for $title", async ({ title, lesson, state, text }) => {
    listStudentScheduleMock.mockResolvedValueOnce([lesson]);
    canJoinLessonMock.mockReturnValueOnce(state);

    const page = await loadStudentSchedulePage();
    const element = await page.default({ searchParams: Promise.resolve({ month: "2026-06" }) });
    render(element);

    const card = cardFor(title);
    expect(within(card).queryByRole("link", { name: /join lesson/i })).toBeNull();
    expect(card.textContent ?? "").toMatch(text);
  });

  it("does not render an unsafe URL from schedule data as an active Join link", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        title: "Unsafe URL lesson",
        liveLessonUrl: "javascript:alert(1)",
      }),
    ]);
    canJoinLessonMock.mockReturnValueOnce({
      enabled: true,
      href: "javascript:alert(1)",
      reason: null,
    });

    const page = await loadStudentSchedulePage();
    const element = await page.default({ searchParams: Promise.resolve({ month: "2026-06" }) });
    render(element);

    const card = cardFor("Unsafe URL lesson");
    expect(within(card).queryByRole("link", { name: /join lesson/i })).toBeNull();
    expect(card.textContent ?? "").toMatch(/meeting link not available yet|invalid meeting link/i);
  });
});
