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
    title: "Teacher algebra lesson",
    description: "Teacher status consistency lesson",
    status: "SCHEDULED",
    startAt: new Date("2026-07-01T10:00:00.000Z"),
    endAt: new Date("2026-07-01T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
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

function setupStartState() {
  canStartLessonMock.mockImplementation(
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
        return { enabled: false, href: null, reason: "Meeting link missing" };
      }

      const now = new Date("2026-07-01T10:15:00.000Z").getTime();
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

function workspaceRecord(overrides: Record<string, unknown> = {}) {
  return {
    lesson: {
      id: "lesson-1",
      title: "Teacher algebra lesson",
      description: "Teacher status consistency lesson",
      status: "SCHEDULED",
      startAt: new Date("2026-07-01T10:00:00.000Z"),
      endAt: new Date("2026-07-01T11:00:00.000Z"),
      timezone: "Africa/Nairobi",
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
        disabled: false,
        href: "/portal/teacher/submissions?scheduledClassId=lesson-1",
        label: "Review Submissions",
      },
      progress: {
        disabled: false,
        href: "/portal/teacher/progress?subjectId=subject-math",
        label: "Open Progress",
      },
      materials: {
        disabled: false,
        href: "/portal/teacher/materials?scheduledClassId=lesson-1",
        label: "Materials",
      },
      attendance: {
        disabled: true,
        href: null,
        reason: "Attendance unavailable for this lesson",
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
      disabled: false,
      href: "/portal/teacher/progress?subjectId=subject-math",
      count: 0,
      label: "Open Progress",
      reason: "No current progress notes for this lesson roster yet.",
    },
    attendanceSummary: {
      disabled: true,
      hidden: true,
      reason: "Attendance unavailable for this lesson",
    },
    ...overrides,
  };
}

function cardFor(title: string) {
  const card = screen.getByText(title).closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("Teacher schedule Lesson Status UI consistency", () => {
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
    setupStartState();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses centralized lesson status labels across teacher dashboard, schedule, and workspace sources", () => {
    const scheduleSource = readFileSync("components/portal/teacher-schedule-display.tsx", "utf8");
    const dashboardSource = readFileSync("app/portal/teacher/page.tsx", "utf8");
    const workspaceSource = readFileSync("app/portal/teacher/lessons/[lessonId]/page.tsx", "utf8");

    for (const source of [scheduleSource, dashboardSource, workspaceSource]) {
      expect(source).toContain("LESSON_STATUS_LABELS");
      expect(source).not.toMatch(/function\s+formatStatus|const\s+formatStatus/);
      expect(source).not.toMatch(/\bPlanned\b|\bMoved\b|\bDone\b|\bCanceled\b/);
    }
  });

  it("renders scheduled, live-derived, completed-derived, cancelled, completed, and rescheduled states", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        id: "future-scheduled",
        title: "Teacher future lesson",
        startAt: new Date("2026-07-01T12:00:00.000Z"),
        endAt: new Date("2026-07-01T13:00:00.000Z"),
      }),
      lessonRecord({
        id: "current-scheduled",
        title: "Teacher current lesson",
      }),
      lessonRecord({
        id: "past-scheduled",
        title: "Teacher past lesson",
        startAt: new Date("2026-07-01T08:00:00.000Z"),
        endAt: new Date("2026-07-01T09:00:00.000Z"),
      }),
      lessonRecord({
        id: "cancelled",
        title: "Teacher cancelled lesson",
        status: "CANCELLED",
        cancelReason: "Teacher illness",
      }),
      lessonRecord({
        id: "completed",
        title: "Teacher explicit completed lesson",
        status: "COMPLETED",
      }),
      lessonRecord({
        id: "rescheduled",
        title: "Teacher rescheduled lesson",
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-original",
      }),
    ]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    expect(cardFor("Teacher future lesson").textContent ?? "").toMatch(/scheduled|upcoming/i);
    expect(cardFor("Teacher future lesson").textContent ?? "").not.toMatch(/planned/i);
    expect(cardFor("Teacher current lesson").textContent ?? "").toMatch(/live/i);
    expect(cardFor("Teacher past lesson").textContent ?? "").toMatch(/completed/i);
    expect(cardFor("Teacher past lesson").textContent ?? "").not.toMatch(/done/i);

    const cancelledCard = cardFor("Teacher cancelled lesson");
    expect(cancelledCard.textContent ?? "").toMatch(/cancelled/i);
    expect(cancelledCard.textContent ?? "").not.toMatch(/canceled/i);
    expect(cancelledCard.textContent ?? "").toMatch(/teacher illness/i);

    expect(cardFor("Teacher explicit completed lesson").textContent ?? "").toMatch(/completed/i);
    const rescheduledCard = cardFor("Teacher rescheduled lesson");
    expect(rescheduledCard.textContent ?? "").toMatch(/rescheduled/i);
    expect(rescheduledCard.textContent ?? "").not.toMatch(/moved/i);
    expect(rescheduledCard.textContent ?? "").toMatch(/rescheduled from/i);
    expect(screen.getAllByText(/europe\/kiev/i).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps Start lesson enabled only in the allowed window and disabled for blocked states", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([
      lessonRecord({
        id: "startable",
        title: "Startable scheduled lesson",
      }),
      lessonRecord({
        id: "future",
        title: "Too early teacher lesson",
        startAt: new Date("2026-07-01T12:00:00.000Z"),
        endAt: new Date("2026-07-01T13:00:00.000Z"),
      }),
      lessonRecord({
        id: "cancelled",
        title: "Cancelled start lesson",
        status: "CANCELLED",
      }),
      lessonRecord({
        id: "completed",
        title: "Completed start lesson",
        status: "COMPLETED",
      }),
      lessonRecord({
        id: "missing-url",
        title: "Missing URL start lesson",
        liveLessonUrl: null,
      }),
    ]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    expect(
      within(cardFor("Startable scheduled lesson")).getByRole("link", { name: /start lesson/i }),
    ).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(cardFor("Too early teacher lesson").textContent ?? "").toMatch(
      /available before lesson/i,
    );
    expect(
      within(cardFor("Cancelled start lesson")).queryByRole("link", { name: /start lesson/i }),
    ).toBeNull();
    expect(
      within(cardFor("Completed start lesson")).queryByRole("link", { name: /start lesson/i }),
    ).toBeNull();
    expect(cardFor("Missing URL start lesson").textContent ?? "").toMatch(/meeting link missing/i);
  });

  it("renders cancel reason and rescheduled marker on detail and blocks cancelled lesson start", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
      workspaceRecord({
        lesson: {
          ...workspaceRecord().lesson,
          id: "cancelled-detail",
          title: "Cancelled detail lesson",
          status: "CANCELLED",
          cancelReason: "Weather closure",
          rescheduledFromId: "lesson-original",
          isRescheduled: true,
          startState: { enabled: false, href: null, reason: "Lesson is cancelled" },
        },
      }),
    );

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "cancelled-detail" } });
    render(element);

    expect(screen.getByRole("heading", { name: /cancelled detail lesson/i })).toBeDefined();
    expect(screen.getByText(/status:\s*cancelled/i)).toBeDefined();
    expect(screen.getByText(/weather closure/i)).toBeDefined();
    expect(screen.getByText(/rescheduled from/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(screen.getByText(/lesson is cancelled/i)).toBeDefined();
  });

  it("does not keep local teacher Start Lesson status/link logic in schedule display source", () => {
    const source = readFileSync("components/portal/teacher-schedule-display.tsx", "utf8");

    expect(source).toContain("TeacherStartLessonButton");
    expect(source).not.toMatch(/function\s+StartLessonControl/);
    expect(source).not.toMatch(/startState\.enabled\s*&&\s*startState\.href/);
    expect(source).not.toMatch(/validateLiveLessonUrl\([^)]*"MANUAL_URL"/);
  });
});
