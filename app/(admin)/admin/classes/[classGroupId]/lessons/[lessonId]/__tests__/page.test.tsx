import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getLessonByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/lesson-repository", () => ({
  getLessonById: getLessonByIdMock,
}));

vi.mock("@/components/admin/classes/LessonRowActions", () => ({
  LessonRowActions: ({ lesson }: { lesson: { status: string; liveLessonUrl?: string | null } }) =>
    lesson.status !== "CANCELLED" && lesson.status !== "COMPLETED" && lesson.liveLessonUrl ? (
      <a href={lesson.liveLessonUrl}>Start Lesson</a>
    ) : null,
}));

type LessonDetailPageModule = {
  default: (props: {
    params:
      | Promise<{ classGroupId: string; lessonId: string }>
      | { classGroupId: string; lessonId: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadLessonDetailPage() {
  const specifier = "@/app/(admin)/admin/classes/[classGroupId]/lessons/[lessonId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<LessonDetailPageModule>;
}

describe("Admin lesson detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN and renders lesson details, roster, live URL, status, and learning summaries", async () => {
    getLessonByIdMock.mockResolvedValueOnce({
      id: "lesson-1",
      classGroupId: "group-1",
      title: "Quadratic functions",
      description: "Live problem-solving session",
      startAt: new Date("2026-01-15T10:00:00.000Z"),
      endAt: new Date("2026-01-15T11:00:00.000Z"),
      status: "SCHEDULED",
      liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      classGroup: {
        id: "group-1",
        name: "IGCSE Mathematics Group A",
        students: [
          { id: "student-1", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
          { id: "student-2", fullName: "Mark Shevchenko", email: "mark@example.com" },
        ],
      },
      teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      materialsCount: 2,
      assignmentsCount: 1,
      submissionsCount: 3,
      remindersCount: 1,
    });

    const page = await loadLessonDetailPage();
    const element = await page.default({
      params: { classGroupId: "group-1", lessonId: "lesson-1" },
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getLessonByIdMock).toHaveBeenCalledWith("lesson-1");
    expect(screen.getByRole("heading", { name: /quadratic functions/i })).toBeDefined();
    expect(screen.getByText(/live problem-solving session/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
    expect(screen.getByText(/jane teacher/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/13:00.*14:00/)).toBeDefined();
    expect(screen.getByText(/scheduled/i)).toBeDefined();
    expect(screen.getByText("https://meet.google.com/abc-defg-hij")).toBeDefined();
    expect(screen.getByText(/sofia shevchenko/i)).toBeDefined();
    expect(screen.getByText(/mark shevchenko/i)).toBeDefined();
    expect(screen.getByText(/2 materials/i)).toBeDefined();
    expect(screen.getByText(/1 assignment/i)).toBeDefined();
    expect(screen.getByText(/3 submissions/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /join|start/i })).toHaveProperty(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("shows cancelled state and hides or disables Join/Start for cancelled lessons", async () => {
    getLessonByIdMock.mockResolvedValueOnce({
      id: "lesson-1",
      classGroupId: "group-1",
      title: "Cancelled revision",
      startAt: new Date("2026-06-01T10:00:00.000Z"),
      endAt: new Date("2026-06-01T11:00:00.000Z"),
      status: "CANCELLED",
      cancelReason: "Teacher unavailable",
      liveLessonUrl: "https://meet.google.com/cancelled",
      classGroup: { id: "group-1", name: "IGCSE Mathematics Group A", students: [] },
      teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    });

    const page = await loadLessonDetailPage();
    const element = await page.default({
      params: { classGroupId: "group-1", lessonId: "lesson-1" },
    });

    render(element);

    expect(screen.getByText(/cancelled/i)).toBeDefined();
    expect(screen.getByText(/teacher unavailable/i)).toBeDefined();
    const joinButton = screen.queryByRole("link", { name: /join|start/i });
    expect(joinButton).toBeNull();
  });
});
