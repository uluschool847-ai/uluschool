import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getStudentScheduleLessonMock = vi.hoisted(() => vi.fn());
const canJoinLessonMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-schedule-repository", () => ({
  getStudentScheduleLesson: getStudentScheduleLessonMock,
  canJoinLesson: canJoinLessonMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type StudentScheduleDetailPageModule = {
  default: (props: {
    params: Promise<{ lessonId: string }> | { lessonId: string };
  }) => Promise<ReactElement> | ReactElement;
};

async function loadStudentScheduleDetailPage() {
  const specifier = "@/app/portal/student/schedule/[lessonId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentScheduleDetailPageModule>;
}

function lessonDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Quadratic functions",
    description: "Teacher notes: focus on factoring strategies.",
    status: "CANCELLED",
    startAt: new Date("2026-06-10T10:00:00.000Z"),
    endAt: new Date("2026-06-10T11:00:00.000Z"),
    timezone: "Europe/Kiev",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
    teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
    cancelReason: "Teacher unavailable",
    rescheduledFromId: null,
    materialsCount: 2,
    materials: [
      { id: "material-1", title: "Quadratics worksheet", url: "https://cdn.example.com/ws.pdf" },
      { id: "material-2", title: "Graphing notes", url: null },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Quadratics homework",
        dueDate: new Date("2026-06-12T20:00:00.000Z"),
        submissionStatus: "GRADED",
        submissionId: "submission-1",
        grade: 92,
      },
      {
        id: "assignment-2",
        title: "Extra practice",
        dueDate: new Date("2026-06-13T20:00:00.000Z"),
        submissionStatus: "NOT_SUBMITTED",
        submissionId: null,
        grade: null,
      },
    ],
    ...overrides,
  };
}

describe("Student schedule lesson detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    canJoinLessonMock.mockReturnValue({
      enabled: false,
      href: null,
      reason: "Lesson is cancelled",
    });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires STUDENT, loads the scoped lesson, and renders full lesson detail", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(lessonDetail());

    const page = await loadStudentScheduleDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getStudentScheduleLessonMock).toHaveBeenCalledWith("student-1", "lesson-1");
    expect(screen.getByRole("heading", { name: /quadratic functions/i })).toBeDefined();
    expect(screen.getAllByText(/mathematics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/igcse/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/jane teacher/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
    expect(screen.getByText(/europe\/kiev/i)).toBeDefined();
    expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/teacher unavailable/i)).toBeDefined();
    expect(screen.getByText(/focus on factoring strategies/i)).toBeDefined();
    expect(screen.getByText(/quadratics worksheet/i)).toBeDefined();
    expect(screen.getByText(/graphing notes/i)).toBeDefined();
    expect(screen.getByText(/quadratics homework/i)).toBeDefined();
    expect(screen.getByText(/extra practice/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/92/)).toBeDefined();
    expect(screen.getByText(/not submitted/i)).toBeDefined();
    expect(screen.getByText("Lesson is cancelled")).toBeDefined();
    expect(screen.queryByRole("link", { name: /join lesson/i })).toBeNull();
  });

  it("renders an enabled join button when the scoped lesson is joinable", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(
      lessonDetail({
        status: "LIVE",
        cancelReason: null,
        description: "Join now for live work.",
      }),
    );
    canJoinLessonMock.mockReturnValueOnce({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });

    const page = await loadStudentScheduleDetailPage();
    const element = await page.default({ params: Promise.resolve({ lessonId: "lesson-1" }) });
    const { container } = render(element);

    const joinLink = screen.getByRole("link", { name: /join lesson/i });
    expect(joinLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(joinLink).toHaveProperty("target", "_blank");
    expect(joinLink).toHaveProperty("rel", "noreferrer");
    expect(container.textContent).not.toContain("https://meet.google.com/abc-defg-hij");
  });

  it("calls notFound when the repository returns null for another student's lesson", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(null);

    const page = await loadStudentScheduleDetailPage();

    await expect(page.default({ params: { lessonId: "lesson-other" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getStudentScheduleLessonMock).toHaveBeenCalledWith("student-1", "lesson-other");
    expect(notFound).toHaveBeenCalled();
  });

  it("keeps another student's lesson data out of the rendered detail", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(null);

    const page = await loadStudentScheduleDetailPage();

    await expect(page.default({ params: { lessonId: "private-lesson" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(screen.queryByText(/private lesson/i)).toBeNull();
  });
});
