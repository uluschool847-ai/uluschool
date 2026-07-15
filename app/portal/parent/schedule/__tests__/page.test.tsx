import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getLinkedChildrenMock = vi.hoisted(() => vi.fn());
const listParentChildScheduleMock = vi.hoisted(() => vi.fn());
const canJoinLessonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getLinkedChildren: getLinkedChildrenMock,
}));

vi.mock("@/lib/repositories/student-schedule-repository", () => ({
  listParentChildSchedule: listParentChildScheduleMock,
  canJoinLesson: canJoinLessonMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

type ParentSchedulePageModule = {
  default: (props: {
    searchParams?: Promise<{
      month?: string;
      studentId?: string;
      subjectId?: string;
      status?: LessonStatus;
    }>;
  }) => Promise<ReactElement> | ReactElement;
};

async function loadParentSchedulePage() {
  const specifier = "@/app/portal/parent/schedule/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentSchedulePageModule>;
}

function child(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    fullName: "Sofia Shevchenko",
    email: "sofia@example.com",
    role: UserRole.STUDENT,
    ...overrides,
  };
}

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Quadratic functions",
    description: "Live problem-solving session",
    status: "LIVE",
    startAt: new Date("2026-06-10T10:00:00.000Z"),
    endAt: new Date("2026-06-10T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
    student: { id: "student-1", fullName: "Sofia Shevchenko" },
    child: { id: "student-1", fullName: "Sofia Shevchenko" },
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

function setupJoinState() {
  canJoinLessonMock.mockImplementation(
    (lesson: { status: LessonStatus; liveLessonUrl?: string }) => {
      if (lesson.status === "CANCELLED") {
        return { enabled: false, href: null, reason: "Lesson is cancelled" };
      }
      if (lesson.status === "COMPLETED") {
        return { enabled: false, href: null, reason: "Lesson is completed" };
      }
      if (!lesson.liveLessonUrl) {
        return { enabled: false, href: null, reason: "Link not available yet" };
      }
      if (lesson.status === "SCHEDULED") {
        return { enabled: false, href: null, reason: "Available before lesson" };
      }
      return { enabled: true, href: lesson.liveLessonUrl, reason: null };
    },
  );
}

describe("Parent child schedule page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
    getLinkedChildrenMock.mockResolvedValue([
      child(),
      child({ id: "student-2", fullName: "Mark Shevchenko", email: "mark@example.com" }),
    ]);
    setupJoinState();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses centralized lesson status labels for parent schedule sources", () => {
    const source = readFileSync("components/portal/schedule-display.tsx", "utf8");

    expect(source).toContain("LESSON_STATUS_LABELS");
    expect(source).not.toMatch(/function\s+formatStatus|const\s+formatStatus/);
    expect(source).not.toMatch(/\bPlanned\b|\bMoved\b|\bDone\b|\bCanceled\b/);
  });

  it("requires PARENT, renders linked child selector, forwards filters, and displays linked child lessons", async () => {
    listParentChildScheduleMock.mockResolvedValueOnce([
      lessonRecord(),
      lessonRecord({
        id: "lesson-rescheduled",
        title: "Rescheduled algebra clinic",
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-old",
        student: { id: "student-1", fullName: "Sofia Shevchenko" },
      }),
      lessonRecord({
        id: "lesson-cancelled",
        title: "Cancelled geometry",
        status: "CANCELLED",
        cancelReason: "Teacher unavailable",
        student: { id: "student-1", fullName: "Sofia Shevchenko" },
      }),
    ]);

    const page = await loadParentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({
        month: "2026-01",
        studentId: "student-1",
        subjectId: "subject-math",
        status: "LIVE",
      }),
    });
    const { container } = render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getLinkedChildrenMock).toHaveBeenCalledWith("parent-1");
    expect(listParentChildScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "parent-1",
        studentId: "student-1",
        subjectId: "subject-math",
        status: "LIVE",
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
    const [input] = listParentChildScheduleMock.mock.calls[0] ?? [];
    expect(input.from).toEqual(new Date("2025-12-31T21:00:00.000Z"));
    expect(input.to).toEqual(new Date("2026-01-31T20:59:59.999Z"));

    expect(screen.getByRole("heading", { name: /child schedule/i })).toBeDefined();
    expect(screen.getByLabelText(/^child$/i)).toHaveProperty("value", "student-1");
    expect(screen.getByRole("option", { name: /sofia shevchenko/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /mark shevchenko/i })).toBeDefined();
    expect(screen.getByText("Lessons for 01 Jan 2026 - 31 Jan 2026")).toBeDefined();
    expect(screen.getByLabelText(/month/i)).toHaveProperty("value", "2026-01");
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "LIVE");
    expect(screen.getByText("Quadratic functions")).toBeDefined();
    expect(screen.getAllByText(/child:\s*sofia shevchenko/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/subject:\s*mathematics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/level:\s*igcse/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/teacher:\s*jane teacher/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/group:\s*igcse mathematics group a/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/africa\/nairobi/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/live/i).length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).not.toMatch(/\bPlanned\b|\bMoved\b|\bDone\b|\bCanceled\b/);
    expect(screen.getByText(/teacher unavailable/i)).toBeDefined();
    expect(screen.getAllByText(/rescheduled/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/rescheduled from/i)).toBeDefined();
    expect(screen.queryByText(/unlinked student lesson/i)).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("article").length).toBeGreaterThanOrEqual(3);
  });

  it("denies wrong roles through the existing portal auth pattern", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const page = await loadParentSchedulePage();

    await expect(
      page.default({ searchParams: Promise.resolve({ month: "2026-06" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getLinkedChildrenMock).not.toHaveBeenCalled();
    expect(listParentChildScheduleMock).not.toHaveBeenCalled();
  });

  it("renders a no-linked-children state without querying schedule lessons", async () => {
    getLinkedChildrenMock.mockResolvedValueOnce([]);

    const page = await loadParentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-06" }),
    });
    render(element);

    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText(/no linked children|no linked students/i)).toBeDefined();
    expect(listParentChildScheduleMock).not.toHaveBeenCalled();
  });

  it("renders an empty state for a selected child and period with no lessons", async () => {
    listParentChildScheduleMock.mockResolvedValueOnce([]);

    const page = await loadParentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-07", studentId: "student-1" }),
    });
    render(element);

    expect(listParentChildScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent-1", studentId: "student-1" }),
    );
    expect(screen.getByText(/no lessons scheduled for this child\/period/i)).toBeDefined();
  });

  it("matches student schedule join-button rules for parent-visible lessons", async () => {
    listParentChildScheduleMock.mockResolvedValueOnce([
      lessonRecord({ id: "live-lesson", title: "Live child lesson", status: "LIVE" }),
      lessonRecord({
        id: "cancelled-lesson",
        title: "Cancelled child lesson",
        status: "CANCELLED",
      }),
      lessonRecord({
        id: "completed-lesson",
        title: "Completed child lesson",
        status: "COMPLETED",
      }),
      lessonRecord({
        id: "missing-link-lesson",
        title: "Missing link child lesson",
        status: "LIVE",
        liveLessonUrl: null,
      }),
      lessonRecord({
        id: "future-lesson",
        title: "Future child lesson",
        status: "SCHEDULED",
      }),
    ]);

    const page = await loadParentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-06" }),
    });
    const { container } = render(element);

    const liveCard = screen.getByText("Live child lesson").closest("article");
    expect(liveCard).not.toBeNull();
    const joinLink = within(liveCard as HTMLElement).getByRole("link", { name: /join lesson/i });
    expect(joinLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(joinLink).toHaveProperty("target", "_blank");
    expect(joinLink).toHaveProperty("rel", "noreferrer");
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

    const cancelledCard = screen.getByText("Cancelled child lesson").closest("article");
    expect(cancelledCard).not.toBeNull();
    expect(
      within(cancelledCard as HTMLElement).queryByRole("link", { name: /join lesson/i }),
    ).toBeNull();

    const completedCard = screen.getByText("Completed child lesson").closest("article");
    expect(completedCard).not.toBeNull();
    expect(
      within(completedCard as HTMLElement).queryByRole("link", { name: /join lesson/i }),
    ).toBeNull();

    expect(screen.getByText("Link not available yet")).toBeDefined();
    expect(screen.getByText("Available before lesson")).toBeDefined();
    expect(container.textContent).not.toContain("https://meet.google.com/abc-defg-hij");
  });
});
