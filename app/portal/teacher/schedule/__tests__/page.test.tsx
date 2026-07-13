import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

type TeacherSchedulePageModule = {
  default: (props: {
    searchParams?: Promise<{
      from?: string;
      to?: string;
      classGroupId?: string;
      subjectId?: string;
      status?: string;
    }>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/schedule/page.tsx";

async function loadTeacherSchedulePage() {
  const specifier = "@/app/portal/teacher/schedule/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherSchedulePageModule>;
}

function expectEnumTeacherGuardSource() {
  const source = readFileSync(PAGE_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Algebra live workshop",
    description: "Teacher-facing schedule card",
    status: "LIVE",
    startAt: new Date("2026-07-10T10:00:00.000Z"),
    endAt: new Date("2026-07-10T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    cancelReason: null,
    rescheduledFromId: null,
    studentCount: 2,
    rosterPreview: [
      { id: "student-1", fullName: "Active Student", email: "active@example.com", isActive: true },
      {
        id: "student-2",
        fullName: "Inactive Student",
        email: "inactive@example.com",
        isActive: false,
      },
    ],
    materialsCount: 1,
    assignmentsCount: 2,
    pendingSubmissionsCount: 1,
    ...overrides,
  };
}

function filterOptions() {
  return {
    classGroups: [
      { id: "group-1", name: "Algebra Group A" },
      { id: "group-2", name: "Geometry Group B" },
    ],
    subjects: [
      { id: "subject-math", name: "Mathematics" },
      { id: "subject-physics", name: "Physics" },
    ],
  };
}

function setupStartState() {
  canStartLessonMock.mockImplementation(
    (lesson: { status: LessonStatus; liveLessonUrl?: string | null }) => {
      if (lesson.status === "CANCELLED") {
        return { enabled: false, href: null, reason: "Lesson is cancelled" };
      }
      if (lesson.status === "COMPLETED") {
        return { enabled: false, href: null, reason: "Lesson is completed" };
      }
      if (!lesson.liveLessonUrl) {
        return { enabled: false, href: null, reason: "Meeting link missing" };
      }
      if (lesson.status === "SCHEDULED") {
        return { enabled: false, href: null, reason: "Available before lesson" };
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

describe("Teacher schedule page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getTeacherScheduleFilterOptionsMock.mockResolvedValue(filterOptions());
    setupStartState();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("requires TEACHER, forwards filters, and renders teacher-owned lesson cards", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([
      lessonRecord(),
      lessonRecord({
        id: "rescheduled-lesson",
        title: "Rescheduled functions workshop",
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-original",
      }),
    ]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({
        from: "2026-07-01",
        to: "2026-07-31",
        classGroupId: "group-1",
        subjectId: "subject-math",
        status: "LIVE",
      }),
    });
    const { container } = render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherScheduleFilterOptionsMock).toHaveBeenCalledWith("teacher-1");
    expect(listTeacherScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-1",
        classGroupId: "group-1",
        subjectId: "subject-math",
        status: "LIVE",
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
    const [input] = listTeacherScheduleMock.mock.calls[0] ?? [];
    expect(input.from).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(input.to).toEqual(new Date("2026-07-31T23:59:59.999Z"));

    expect(screen.getByRole("heading", { name: /teacher schedule/i })).toBeDefined();
    expect(screen.getByLabelText(/from/i)).toHaveProperty("value", "2026-07-01");
    expect(screen.getByLabelText(/to/i)).toHaveProperty("value", "2026-07-31");
    expect(screen.getByLabelText(/class group/i)).toHaveProperty("tagName", "SELECT");
    expect(screen.getByLabelText(/class group/i)).toHaveProperty("value", "group-1");
    expect(screen.getByLabelText(/subject/i)).toHaveProperty("tagName", "SELECT");
    expect(screen.getByLabelText(/subject/i)).toHaveProperty("value", "subject-math");
    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "LIVE");
    expect(screen.getByRole("link", { name: /availability/i })).toHaveProperty(
      "href",
      expect.stringContaining("/portal/teacher/availability"),
    );

    const card = cardFor("Algebra live workshop");
    const cardText = card.textContent ?? "";
    expect(cardText).toMatch(/subject:\s*mathematics/i);
    expect(cardText).toMatch(/group:\s*algebra group a/i);
    expect(cardText).toMatch(/africa\/nairobi/i);
    expect(cardText).toMatch(/live/i);
    expect(cardText).toMatch(/students:\s*2/i);
    expect(cardText).toMatch(/active student/i);
    expect(cardText).toMatch(/inactive student/i);
    expect(cardText).toMatch(/inactive/i);
    expect(cardText).toMatch(/materials:\s*1/i);
    expect(cardText).toMatch(/assignments:\s*2/i);
    expect(cardText).toMatch(/pending submissions:\s*1/i);
    expect(screen.getByText("Rescheduled functions workshop")).toBeDefined();
    expect(screen.getByText(/rescheduled from/i)).toBeDefined();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("article").length).toBeGreaterThanOrEqual(2);
  });

  it("renders teacher-owned class group and subject select options only", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([]);
    getTeacherScheduleFilterOptionsMock.mockResolvedValueOnce(filterOptions());

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({
        classGroupId: "group-2",
        subjectId: "subject-physics",
        status: "COMPLETED",
      }),
    });
    render(element);

    const classGroupSelect = screen.getByLabelText(/class group/i);
    const subjectSelect = screen.getByLabelText(/subject/i);

    expect(classGroupSelect).toHaveProperty("tagName", "SELECT");
    expect(subjectSelect).toHaveProperty("tagName", "SELECT");
    expect(screen.queryByPlaceholderText(/class group id/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/subject id/i)).toBeNull();
    expect(
      within(classGroupSelect).getByRole("option", { name: "Algebra Group A" }),
    ).toHaveProperty("value", "group-1");
    expect(
      within(classGroupSelect).getByRole("option", { name: "Geometry Group B" }),
    ).toHaveProperty("value", "group-2");
    expect(within(subjectSelect).getByRole("option", { name: "Mathematics" })).toHaveProperty(
      "value",
      "subject-math",
    );
    expect(within(subjectSelect).getByRole("option", { name: "Physics" })).toHaveProperty(
      "value",
      "subject-physics",
    );
    expect(screen.queryByText(/other teacher/i)).toBeNull();
    expect(classGroupSelect).toHaveProperty("value", "group-2");
    expect(subjectSelect).toHaveProperty("value", "subject-physics");
    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "COMPLETED");
  });

  it("allows only supported lesson statuses and does not forward invalid status queries", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ status: "ARCHIVED" }),
    });
    render(element);

    const statusSelect = screen.getByLabelText(/status/i);
    expect(
      within(statusSelect)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED", "RESCHEDULED"]);
    expect(statusSelect).toHaveProperty("value", "");
    expect(listTeacherScheduleMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: "ARCHIVED" }),
    );
    expect(within(statusSelect).getByRole("option", { name: /all statuses/i })).toBeDefined();
  });

  it("falls back safely for invalid date values and forwards valid date ranges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    listTeacherScheduleMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "not-a-date", to: "2026-07-15" }),
    });
    render(element);

    const [input] = listTeacherScheduleMock.mock.calls[0] ?? [];
    expect(input.from).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(input.to).toEqual(new Date("2026-07-15T23:59:59.999Z"));
    expect(screen.getByLabelText(/from/i)).toHaveProperty("value", "2026-07-01");
    expect(screen.getByLabelText(/to/i)).toHaveProperty("value", "2026-07-15");
  });

  it("falls back to the current month and shows feedback when from is after to", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    listTeacherScheduleMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-08-01", to: "2026-07-01" }),
    });
    render(element);

    const [input] = listTeacherScheduleMock.mock.calls[0] ?? [];
    expect(input.from).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(input.to).toEqual(new Date("2026-07-31T23:59:59.999Z"));
    expect(screen.getByText(/date range was reset/i)).toBeDefined();
  });

  it("clamps or reports ranges longer than six months", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-01-01", to: "2026-12-31" }),
    });
    render(element);

    const [input] = listTeacherScheduleMock.mock.calls[0] ?? [];
    const sixMonthsInMs = 184 * 24 * 60 * 60 * 1000;
    expect(input.to.getTime() - input.from.getTime()).toBeLessThanOrEqual(sixMonthsInMs);
    expect(screen.getByText(/maximum range is 6 months|date range was limited/i)).toBeDefined();
  });

  it("renders reset, clear, quick range links, and an active filter summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    listTeacherScheduleMock.mockResolvedValueOnce([lessonRecord()]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({
        from: "2026-07-01",
        to: "2026-07-31",
        classGroupId: "group-1",
        subjectId: "subject-math",
        status: "LIVE",
      }),
    });
    render(element);

    expect(screen.getByRole("button", { name: /^apply$/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /reset filters/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(screen.getByRole("link", { name: /^clear$/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(screen.getByRole("link", { name: /^today$/i }).getAttribute("href")).toContain(
      "from=2026-07-10",
    );
    expect(screen.getByRole("link", { name: /^today$/i }).getAttribute("href")).toContain(
      "to=2026-07-10",
    );
    expect(screen.getByRole("link", { name: /this week/i }).getAttribute("href")).toMatch(
      /from=\d{4}-\d{2}-\d{2}.*to=\d{4}-\d{2}-\d{2}/,
    );
    expect(screen.getByRole("link", { name: /this month/i }).getAttribute("href")).toContain(
      "from=2026-07-01",
    );
    expect(screen.getByRole("link", { name: /next 7 days/i }).getAttribute("href")).toMatch(
      /from=\d{4}-\d{2}-\d{2}.*to=\d{4}-\d{2}-\d{2}/,
    );
    const summary = screen.getByLabelText(/active filters/i);
    expect(within(summary).getByText(/active filters/i)).toBeDefined();
    expect(within(summary).getByText(/algebra group a/i)).toBeDefined();
    expect(within(summary).getByText(/mathematics/i)).toBeDefined();
    expect(within(summary).getByText(/live/i)).toBeDefined();
    expect(within(summary).getByText(/2026-07-01.*2026-07-31/i)).toBeDefined();
  });

  it("uses the enum-based server-side TEACHER page guard", () => {
    expectEnumTeacherGuardSource();
  });

  it("lets an active teacher render the schedule through the page guard", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([lessonRecord()]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: "teacher-1" }),
    );
    expect(screen.getByRole("heading", { name: /teacher schedule/i })).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions at the schedule page guard",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherSchedulePage();

      await expect(
        page.default({ searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }) }),
      ).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(listTeacherScheduleMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before schedule data loads", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/portal/login?reason=invalid"));

    const page = await loadTeacherSchedulePage();

    await expect(
      page.default({ searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/portal/login?reason=invalid");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherScheduleMock).not.toHaveBeenCalled();
  });

  it("renders empty state when no lessons are scheduled for the period", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByText("No lessons scheduled.")).toBeDefined();
  });

  it("renders filtered empty state when filters produce no matching lessons", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([]);

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ classGroupId: "group-1" }),
    });
    render(element);

    expect(screen.getByText("No lessons match the selected filters.")).toBeDefined();
  });

  it("renders start lesson states without exposing raw meeting URLs as ordinary text", async () => {
    listTeacherScheduleMock.mockResolvedValueOnce([
      lessonRecord({ id: "live-lesson", title: "Live startable lesson", status: "LIVE" }),
      lessonRecord({
        id: "cancelled-lesson",
        title: "Cancelled lesson",
        status: "CANCELLED",
        cancelReason: "Teacher illness",
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

    const page = await loadTeacherSchedulePage();
    const element = await page.default({
      searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
    });
    const { container } = render(element);

    const liveCard = cardFor("Live startable lesson");
    const startLink = within(liveCard).getByRole("link", { name: /start lesson/i });
    expect(startLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(startLink).toHaveProperty("target", "_blank");
    expect(startLink).toHaveProperty("rel", "noreferrer");

    const cancelledCard = cardFor("Cancelled lesson");
    expect(within(cancelledCard).queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(cancelledCard.textContent ?? "").toMatch(/teacher illness/i);

    const completedCard = cardFor("Completed lesson");
    expect(within(completedCard).queryByRole("link", { name: /start lesson/i })).toBeNull();

    expect(screen.getByText("Meeting link missing")).toBeDefined();
    expect(screen.getByText("Available before lesson")).toBeDefined();
    expect(container.textContent).not.toContain("https://meet.google.com/abc-defg-hij");
  });
});
