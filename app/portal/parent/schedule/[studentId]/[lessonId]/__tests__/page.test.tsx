import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getParentScopedStudentScheduleLessonMock = vi.hoisted(() => vi.fn());
const canJoinLessonMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-schedule-repository", () => ({
  getParentScopedStudentScheduleLesson: getParentScopedStudentScheduleLessonMock,
  canJoinLesson: canJoinLessonMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type ParentScheduleDetailPageModule = {
  default: (props: {
    params:
      | Promise<{ studentId: string; lessonId: string }>
      | { studentId: string; lessonId: string };
  }) => Promise<ReactElement> | ReactElement;
};

async function loadParentScheduleDetailPage() {
  const specifier = "@/app/portal/parent/schedule/[studentId]/[lessonId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentScheduleDetailPageModule>;
}

function lessonDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Quadratic functions",
    description: "Teacher notes: focus on factoring strategies.",
    status: "CANCELLED",
    startAt: new Date("2026-06-10T10:00:00.000Z"),
    endAt: new Date("2026-06-10T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    student: { id: "student-1", fullName: "Sofia Shevchenko" },
    child: { id: "student-1", fullName: "Sofia Shevchenko" },
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
    teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
    attendance: {
      id: "attendance-1",
      status: "ABSENT",
      lateMinutes: null,
      reason: "Family emergency",
      markedAt: new Date("2026-06-10T10:12:00.000Z"),
    },
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
        feedback: "Strong structure. Improve final explanation.",
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

describe("Parent child schedule lesson detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
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

  it("requires PARENT, loads the parent-scoped linked child lesson, and renders full detail", async () => {
    getParentScopedStudentScheduleLessonMock.mockResolvedValueOnce(lessonDetail());

    const page = await loadParentScheduleDetailPage();
    const element = await page.default({
      params: { studentId: "student-1", lessonId: "lesson-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentScopedStudentScheduleLessonMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      "lesson-1",
    );
    expect(screen.getByText(/child:\s*sofia shevchenko/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /quadratic functions/i })).toBeDefined();
    expect(screen.getAllByText(/mathematics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/igcse/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/jane teacher/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
    expect(screen.getByText(/europe\/kiev/i)).toBeDefined();
    expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/teacher unavailable/i)).toBeDefined();
    expect(screen.getByText(/quadratics worksheet/i)).toBeDefined();
    expect(screen.getByText(/graphing notes/i)).toBeDefined();
    expect(screen.getByText(/quadratics homework/i)).toBeDefined();
    expect(screen.getByText(/extra practice/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/92/)).toBeDefined();
    expect(screen.getByText(/strong structure/i)).toBeDefined();
    expect(screen.getByText(/not submitted/i)).toBeDefined();
    expect(screen.getByText("Lesson is cancelled")).toBeDefined();
    expect(screen.queryByRole("link", { name: /join lesson/i })).toBeNull();
  });

  it("renders an enabled join button when the parent-visible child lesson is joinable", async () => {
    getParentScopedStudentScheduleLessonMock.mockResolvedValueOnce(
      lessonDetail({ status: "LIVE", cancelReason: null }),
    );
    canJoinLessonMock.mockReturnValueOnce({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });

    const page = await loadParentScheduleDetailPage();
    const element = await page.default({
      params: Promise.resolve({ studentId: "student-1", lessonId: "lesson-1" }),
    });
    const { container } = render(element);

    const joinLink = screen.getByRole("link", { name: /join lesson/i });
    expect(joinLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(joinLink).toHaveProperty("target", "_blank");
    expect(joinLink).toHaveProperty("rel", "noreferrer");
    expect(container.textContent).not.toContain("https://meet.google.com/abc-defg-hij");
  });

  it("shows grade without feedback for the linked child when graded feedback is null", async () => {
    getParentScopedStudentScheduleLessonMock.mockResolvedValueOnce(
      lessonDetail({
        assignments: [
          {
            id: "assignment-1",
            title: "Quadratics homework",
            dueDate: new Date("2026-06-12T20:00:00.000Z"),
            submissionStatus: "GRADED",
            submissionId: "submission-1",
            grade: 88,
            feedback: null,
          },
        ],
      }),
    );

    const page = await loadParentScheduleDetailPage();
    const element = await page.default({
      params: { studentId: "student-1", lessonId: "lesson-1" },
    });
    render(element);

    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/88/)).toBeDefined();
    expect(screen.queryByText(/feedback:/i)).toBeNull();
    expect(screen.queryByText(/strong structure/i)).toBeNull();
  });

  it("shows attendance only for the linked child lesson", async () => {
    getParentScopedStudentScheduleLessonMock.mockResolvedValueOnce(
      lessonDetail({
        attendance: {
          id: "attendance-1",
          lateMinutes: null,
          reason: "Family emergency",
          status: "ABSENT",
        },
      }),
    );

    const page = await loadParentScheduleDetailPage();
    const element = await page.default({
      params: { studentId: "student-1", lessonId: "lesson-1" },
    });
    render(element);

    expect(screen.getByRole("heading", { name: /attendance/i })).toBeDefined();
    expect(screen.getByText(/attendance:\s*absent/i)).toBeDefined();
    expect(screen.getByText(/family emergency/i)).toBeDefined();
    expect(screen.queryByText(/unlinked child attendance/i)).toBeNull();
  });

  it("calls notFound when the student is not linked to the parent", async () => {
    getParentScopedStudentScheduleLessonMock.mockResolvedValueOnce(null);

    const page = await loadParentScheduleDetailPage();

    await expect(
      page.default({ params: { studentId: "student-unlinked", lessonId: "lesson-1" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getParentScopedStudentScheduleLessonMock).toHaveBeenCalledWith(
      "parent-1",
      "student-unlinked",
      "lesson-1",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound when the lesson does not belong to the linked child", async () => {
    getParentScopedStudentScheduleLessonMock.mockResolvedValueOnce(null);

    const page = await loadParentScheduleDetailPage();

    await expect(
      page.default({ params: { studentId: "student-1", lessonId: "unrelated-lesson" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getParentScopedStudentScheduleLessonMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      "unrelated-lesson",
    );
    expect(screen.queryByText(/unrelated lesson/i)).toBeNull();
  });
});
