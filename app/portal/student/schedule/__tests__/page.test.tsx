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
    title: "Quadratic functions",
    description: "Live problem-solving session",
    status: "LIVE",
    startAt: new Date("2026-06-10T10:00:00.000Z"),
    endAt: new Date("2026-06-10T11:00:00.000Z"),
    timezone: "Europe/Kiev",
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

describe("Student schedule page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    setupJoinState();
  });

  afterEach(() => {
    cleanup();
  });

  it("requires STUDENT, forwards filters, and renders accessible lesson cards", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([
      lessonRecord(),
      lessonRecord({
        id: "lesson-rescheduled",
        title: "Rescheduled algebra clinic",
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-old",
      }),
    ]);

    const page = await loadStudentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({
        month: "2026-06",
        subjectId: "subject-math",
        status: "LIVE",
      }),
    });
    const { container } = render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listStudentScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "student-1",
        subjectId: "subject-math",
        status: "LIVE",
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
    const [input] = listStudentScheduleMock.mock.calls[0] ?? [];
    expect(input.from.getFullYear()).toBe(2026);
    expect(input.from.getMonth()).toBe(5);
    expect(input.to.getFullYear()).toBe(2026);
    expect(input.to.getMonth()).toBe(5);

    expect(screen.getByRole("heading", { name: /student schedule/i })).toBeDefined();
    expect(screen.getByLabelText(/month/i)).toHaveProperty("value", "2026-06");
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "LIVE");
    expect(screen.getByText("Quadratic functions")).toBeDefined();
    expect(screen.getAllByText(/subject:\s*mathematics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/level:\s*igcse/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/teacher:\s*jane teacher/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/group:\s*igcse mathematics group a/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/europe\/kiev/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/live/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/rescheduled/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/rescheduled from/i)).toBeDefined();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("article").length).toBeGreaterThanOrEqual(2);
  });

  it("denies wrong roles through the existing portal auth pattern", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const page = await loadStudentSchedulePage();

    await expect(
      page.default({ searchParams: Promise.resolve({ month: "2026-06" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listStudentScheduleMock).not.toHaveBeenCalled();
  });

  it("renders empty state for a period without lessons", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([]);

    const page = await loadStudentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-07" }),
    });
    render(element);

    expect(screen.getByText("No lessons scheduled for this period.")).toBeDefined();
  });

  it("renders join lesson states without exposing raw Meet URLs as ordinary text", async () => {
    listStudentScheduleMock.mockResolvedValueOnce([
      lessonRecord({ id: "live-lesson", title: "Live joinable lesson", status: "LIVE" }),
      lessonRecord({
        id: "cancelled-lesson",
        title: "Cancelled lesson",
        status: "CANCELLED",
        cancelReason: "Teacher unavailable",
      }),
      lessonRecord({ id: "completed-lesson", title: "Completed lesson", status: "COMPLETED" }),
      lessonRecord({
        id: "missing-link-lesson",
        title: "Missing link lesson",
        status: "LIVE",
        liveLessonUrl: null,
      }),
      lessonRecord({ id: "future-lesson", title: "Future lesson", status: "SCHEDULED" }),
    ]);

    const page = await loadStudentSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ month: "2026-06" }),
    });
    const { container } = render(element);

    const liveCard = screen.getByText("Live joinable lesson").closest("article");
    expect(liveCard).not.toBeNull();
    const joinLink = within(liveCard as HTMLElement).getByRole("link", { name: /join lesson/i });
    expect(joinLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(joinLink).toHaveProperty("target", "_blank");
    expect(joinLink).toHaveProperty("rel", "noreferrer");

    const cancelledCard = screen.getByText("Cancelled lesson").closest("article");
    expect(cancelledCard).not.toBeNull();
    expect(
      within(cancelledCard as HTMLElement).queryByRole("link", { name: /join lesson/i }),
    ).toBeNull();
    expect(within(cancelledCard as HTMLElement).getByText(/teacher unavailable/i)).toBeDefined();

    const completedCard = screen.getByText("Completed lesson").closest("article");
    expect(completedCard).not.toBeNull();
    expect(
      within(completedCard as HTMLElement).queryByRole("link", { name: /join lesson/i }),
    ).toBeNull();

    expect(screen.getByText("Link not available yet")).toBeDefined();
    expect(screen.getByText("Available before lesson")).toBeDefined();
    expect(container.textContent).not.toContain("https://meet.google.com/abc-defg-hij");
  });
});
