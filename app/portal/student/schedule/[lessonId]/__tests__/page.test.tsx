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
    timezone: "Africa/Nairobi",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
    teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
    attendance: {
      id: "attendance-1",
      status: "LATE",
      lateMinutes: 7,
      reason: "Transport delay",
      markedAt: new Date("2026-06-10T10:12:00.000Z"),
    },
    cancelReason: "Teacher unavailable",
    rescheduledFromId: null,
    materialsCount: 2,
    materials: [
      {
        id: "material-1",
        title: "Quadratics worksheet",
        url: "https://cdn.example.com/ws.pdf",
        safeFileUrl: "https://cdn.example.com/ws.pdf",
        attachments: [
          {
            filename: "quadratics-extra.pdf",
            href: "/uploads/materials/quadratics-extra.pdf",
            mimeType: "application/pdf",
            size: 1234,
          },
        ],
      },
      {
        id: "material-2",
        title: "Graphing notes",
        url: "/uploads/materials/graphing-notes.pdf",
        safeFileUrl: "/uploads/materials/graphing-notes.pdf",
        attachments: [],
      },
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
    expect(screen.getByRole("link", { name: /quadratics worksheet/i })).toHaveAttribute(
      "href",
      "https://cdn.example.com/ws.pdf",
    );
    expect(screen.getByRole("link", { name: /graphing notes/i })).toHaveAttribute(
      "href",
      "/uploads/materials/graphing-notes.pdf",
    );
    expect(screen.getByRole("link", { name: /quadratics-extra\.pdf/i })).toHaveAttribute(
      "href",
      "/uploads/materials/quadratics-extra.pdf",
    );
    expect(screen.getByRole("link", { name: /view all materials/i })).toHaveAttribute(
      "href",
      "/portal/student/materials?scheduledClassId=lesson-1",
    );
    expect(screen.getByText(/quadratics homework/i)).toBeDefined();
    expect(screen.getByText(/extra practice/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/92/)).toBeDefined();
    expect(screen.getByText(/strong structure/i)).toBeDefined();
    expect(screen.getByText(/not submitted/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view attendance history/i })).toHaveAttribute(
      "href",
      "/portal/student/attendance?scheduledClassId=lesson-1",
    );
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

  it("shows grade without feedback when graded submission feedback is null", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(
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

    const page = await loadStudentScheduleDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/88/)).toBeDefined();
    expect(screen.queryByText(/feedback:/i)).toBeNull();
    expect(screen.queryByText(/strong structure/i)).toBeNull();
  });

  it("shows only the signed-in student's own lesson attendance", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(
      lessonDetail({
        attendance: {
          id: "attendance-1",
          lateMinutes: 7,
          markedAt: new Date("2026-06-10T10:12:00.000Z"),
          reason: "Transport delay",
          status: "LATE",
        },
      }),
    );

    const page = await loadStudentScheduleDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    expect(screen.getByRole("heading", { name: /attendance/i })).toBeDefined();
    expect(screen.getByText(/attendance:\s*late/i)).toBeDefined();
    expect(screen.getByText(/late minutes:\s*7/i)).toBeDefined();
    expect(screen.getByText(/transport delay/i)).toBeDefined();
    expect(screen.getByText(/marked/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view attendance history/i })).toHaveAttribute(
      "href",
      "/portal/student/attendance?scheduledClassId=lesson-1",
    );
    expect(screen.queryByText(/other student attendance/i)).toBeNull();
  });

  it("keeps the attendance section visible with a clear empty state when attendance is unmarked", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(lessonDetail({ attendance: null }));

    const page = await loadStudentScheduleDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    const attendanceSection = screen.getByRole("region", { name: /attendance/i });
    expect(within(attendanceSection).getByText(/attendance has not been marked/i)).toBeDefined();
    expect(
      within(attendanceSection).getByRole("link", { name: /view attendance history/i }),
    ).toHaveAttribute("href", "/portal/student/attendance?scheduledClassId=lesson-1");
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

  it("does not render unsafe lesson material URLs as active links", async () => {
    getStudentScheduleLessonMock.mockResolvedValueOnce(
      lessonDetail({
        materials: [
          {
            id: "material-unsafe-js",
            title: "Unsafe javascript worksheet",
            url: "javascript:alert(1)",
            attachments: [{ filename: "unsafe-js.pdf", href: "javascript:alert(2)" }],
          },
          {
            id: "material-unsafe-data",
            title: "Unsafe data notes",
            url: "data:text/html,<h1>unsafe</h1>",
            attachments: [{ filename: "unsafe-data.pdf", href: "data:text/plain,unsafe" }],
          },
          {
            id: "material-unsafe-file",
            title: "Unsafe file notes",
            url: "file:///etc/passwd",
            attachments: [{ filename: "unsafe-file.pdf", href: "file:///etc/passwd" }],
          },
          {
            id: "material-unsafe-http",
            title: "Unsafe http notes",
            url: "http://cdn.example.com/insecure.pdf",
            attachments: [{ filename: "unsafe-http.pdf", href: "http://cdn.example.com/a.pdf" }],
          },
        ],
      }),
    );

    const page = await loadStudentScheduleDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    const { container } = render(element);

    expect(screen.getByText(/unsafe javascript worksheet/i)).toBeDefined();
    expect(screen.getByText(/unsafe data notes/i)).toBeDefined();
    expect(screen.getByText(/unsafe file notes/i)).toBeDefined();
    expect(screen.getByText(/unsafe http notes/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /unsafe javascript worksheet/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe data notes/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe file notes/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe http notes/i })).toBeNull();
    expect(container.textContent).not.toContain("javascript:alert");
    expect(container.textContent).not.toContain("data:text");
    expect(container.textContent).not.toContain("file://");
    expect(container.textContent).not.toContain("http://cdn.example.com");
  });
});
