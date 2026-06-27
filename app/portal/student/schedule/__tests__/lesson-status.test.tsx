import { readFileSync } from "node:fs";
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
    title: "Algebra lesson",
    description: "Status consistency lesson",
    status: "SCHEDULED",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
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
    (lesson: {
      status: LessonStatus;
      startAt: Date;
      endAt: Date;
      liveLessonUrl?: string | null;
    }) => {
      if (lesson.status === "CANCELLED") {
        return { enabled: false, href: null, reason: "Lesson is cancelled" };
      }
      if (lesson.status === "COMPLETED") {
        return { enabled: false, href: null, reason: "Lesson is completed" };
      }
      if (!lesson.liveLessonUrl) {
        return { enabled: false, href: null, reason: "Link not available yet" };
      }

      const now = new Date("2026-06-01T10:15:00.000Z").getTime();
      const opensAt = lesson.startAt.getTime() - 15 * 60 * 1000;
      const closesAt = lesson.endAt.getTime() + 15 * 60 * 1000;
      if (now < opensAt) {
        return { enabled: false, href: null, reason: "Available before lesson" };
      }
      if (now > closesAt) {
        return { enabled: false, href: null, reason: "Lesson has ended" };
      }
      return { enabled: true, href: lesson.liveLessonUrl, reason: null };
    },
  );
}

function cardFor(title: string) {
  const card = screen.getByText(title).closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("Student schedule Lesson Status UI consistency", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:15:00.000Z"));
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    setupJoinState();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses centralized lesson status labels for student schedule sources", () => {
    const source = readFileSync("components/portal/schedule-display.tsx", "utf8");

    expect(source).toContain("LESSON_STATUS_LABELS");
    expect(source).not.toMatch(/function\s+formatStatus|const\s+formatStatus/);
    expect(source).not.toMatch(/\bPlanned\b|\bMoved\b|\bDone\b|\bCanceled\b/);
  });

  it("renders scheduled, live-derived, completed-derived, cancelled, completed, and rescheduled states", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        id: "future-scheduled",
        title: "Future algebra lesson",
        startAt: new Date("2026-06-01T12:00:00.000Z"),
        endAt: new Date("2026-06-01T13:00:00.000Z"),
      }),
      lessonRecord({
        id: "current-scheduled",
        title: "Current algebra lesson",
      }),
      lessonRecord({
        id: "past-scheduled",
        title: "Past algebra lesson",
        startAt: new Date("2026-06-01T08:00:00.000Z"),
        endAt: new Date("2026-06-01T09:00:00.000Z"),
      }),
      lessonRecord({
        id: "cancelled",
        title: "Cancelled algebra lesson",
        status: "CANCELLED",
        cancelReason: "Teacher unavailable",
      }),
      lessonRecord({
        id: "completed",
        title: "Explicit completed algebra lesson",
        status: "COMPLETED",
      }),
      lessonRecord({
        id: "rescheduled",
        title: "Rescheduled algebra lesson",
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-original",
      }),
    ]);

    const page = await loadStudentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-06" }),
    });
    render(element);

    expect(cardFor("Future algebra lesson").textContent ?? "").toMatch(/scheduled|upcoming/i);
    expect(cardFor("Future algebra lesson").textContent ?? "").not.toMatch(/planned/i);
    expect(cardFor("Current algebra lesson").textContent ?? "").toMatch(/live/i);
    expect(cardFor("Past algebra lesson").textContent ?? "").toMatch(/completed/i);
    expect(cardFor("Past algebra lesson").textContent ?? "").not.toMatch(/done/i);

    const cancelledCard = cardFor("Cancelled algebra lesson");
    expect(cancelledCard.textContent ?? "").toMatch(/cancelled/i);
    expect(cancelledCard.textContent ?? "").not.toMatch(/canceled/i);
    expect(cancelledCard.textContent ?? "").toMatch(/teacher unavailable/i);

    expect(cardFor("Explicit completed algebra lesson").textContent ?? "").toMatch(/completed/i);
    const rescheduledCard = cardFor("Rescheduled algebra lesson");
    expect(rescheduledCard.textContent ?? "").toMatch(/rescheduled/i);
    expect(rescheduledCard.textContent ?? "").not.toMatch(/moved/i);
    expect(rescheduledCard.textContent ?? "").toMatch(/rescheduled from/i);
    expect(screen.getAllByText(/europe\/kiev/i).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps Join lesson enabled only in the allowed window and disabled for blocked states", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        id: "joinable",
        title: "Joinable scheduled lesson",
      }),
      lessonRecord({
        id: "future",
        title: "Too early scheduled lesson",
        startAt: new Date("2026-06-01T12:00:00.000Z"),
        endAt: new Date("2026-06-01T13:00:00.000Z"),
      }),
      lessonRecord({
        id: "cancelled",
        title: "Cancelled join lesson",
        status: "CANCELLED",
      }),
      lessonRecord({
        id: "completed",
        title: "Completed join lesson",
        status: "COMPLETED",
      }),
      lessonRecord({
        id: "missing-url",
        title: "Missing URL join lesson",
        liveLessonUrl: null,
      }),
    ]);

    const page = await loadStudentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-06" }),
    });
    render(element);

    expect(
      within(cardFor("Joinable scheduled lesson")).getByRole("link", { name: /join lesson/i }),
    ).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(cardFor("Too early scheduled lesson").textContent ?? "").toMatch(
      /available before lesson/i,
    );
    expect(
      within(cardFor("Cancelled join lesson")).queryByRole("link", { name: /join lesson/i }),
    ).toBeNull();
    expect(
      within(cardFor("Completed join lesson")).queryByRole("link", { name: /join lesson/i }),
    ).toBeNull();
    expect(cardFor("Missing URL join lesson").textContent ?? "").toMatch(/link not available yet/i);
  });
});
