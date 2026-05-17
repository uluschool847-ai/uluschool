import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherScheduleLessonMock = vi.hoisted(() => vi.fn());
const getTeacherLessonWorkspaceMock = vi.hoisted(() => vi.fn());
const canStartLessonMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-schedule-repository", () => ({
  getTeacherScheduleLesson: getTeacherScheduleLessonMock,
  canStartLesson: canStartLessonMock,
}));

vi.mock("@/lib/repositories/teacher-lesson-workspace-repository", () => ({
  getTeacherLessonWorkspace: getTeacherLessonWorkspaceMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

type TeacherLessonDetailPageModule = {
  default: (props: {
    params: Promise<{ lessonId: string }> | { lessonId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/lessons/[lessonId]/page.tsx";

async function loadTeacherLessonDetailPage() {
  const specifier = "@/app/portal/teacher/lessons/[lessonId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherLessonDetailPageModule>;
}

function expectEnumTeacherGuardSource() {
  const source = readFileSync(PAGE_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function expectWorkspaceRepositorySource() {
  const source = readFileSync(PAGE_SOURCE_PATH, "utf8");
  expect(source).toContain("@/lib/repositories/teacher-lesson-workspace-repository");
  expect(source).toContain("getTeacherLessonWorkspace(session.uid, resolved.lessonId)");
  expect(source).not.toContain("getTeacherScheduleLesson(session.uid, resolved.lessonId)");
}

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Algebra live workshop",
    description: "Teacher-facing lesson detail",
    status: "RESCHEDULED",
    startAt: new Date("2026-07-10T10:00:00.000Z"),
    endAt: new Date("2026-07-10T11:00:00.000Z"),
    timezone: "Europe/Kiev",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    cancelReason: "Original time changed",
    rescheduledFromId: "lesson-original",
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
    assignmentsCount: 1,
    pendingSubmissionsCount: 1,
    materials: [
      { id: "material-1", title: "Algebra worksheet", fileUrl: "/materials/algebra.pdf" },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Algebra homework",
        dueDate: new Date("2026-07-12T20:00:00.000Z"),
        submissionCount: 2,
        pendingSubmissionCount: 1,
      },
    ],
    submissionsSummary: { total: 2, pending: 1, graded: 1 },
    ...overrides,
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
      return { enabled: true, href: lesson.liveLessonUrl, reason: null };
    },
  );
}

function workspaceRecord(overrides: Record<string, unknown> = {}) {
  return {
    lesson: {
      id: "lesson-1",
      title: "Algebra live workshop",
      description: "Teacher-facing lesson detail",
      status: "RESCHEDULED",
      startAt: new Date("2026-07-10T10:00:00.000Z"),
      endAt: new Date("2026-07-10T11:00:00.000Z"),
      timezone: "Europe/Kiev",
      cancelReason: "Original time changed",
      rescheduledFromId: "lesson-original",
      isRescheduled: true,
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
        disabled: true,
        href: null,
        reason: "Teacher submissions route is not implemented",
      },
      progress: {
        disabled: true,
        href: null,
        reason: "Teacher progress route is not implemented",
      },
      materials: {
        disabled: true,
        href: null,
        reason: "Teacher materials route is not implemented",
      },
      attendance: {
        disabled: true,
        href: null,
        reason: "Attendance module is not implemented",
      },
    },
    roster: [
      {
        id: "student-active",
        fullName: "Active Student",
        email: "active@example.com",
        isActive: true,
        learningStatus: "ACTIVE",
        submissionStatus: "pending",
      },
      {
        id: "student-inactive",
        fullName: "Inactive Student",
        email: "inactive@example.com",
        isActive: false,
        learningStatus: "PAUSED",
        submissionStatus: "graded",
      },
    ],
    materials: [
      {
        id: "material-1",
        title: "Algebra worksheet",
        description: "Practice file",
        fileUrl: "/uploads/algebra.pdf",
        createdAt: new Date("2026-07-01T08:00:00.000Z"),
        fileLink: {
          href: "/uploads/algebra.pdf",
          label: "Open Algebra worksheet",
          disabled: false,
        },
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Algebra homework",
        dueDate: new Date("2026-07-12T20:00:00.000Z"),
        isArchived: false,
        dueState: "due-soon",
        submissionsCount: 2,
        pendingSubmissionsCount: 1,
        review: {
          disabled: true,
          href: null,
          reason: "Teacher submissions route is not implemented",
        },
      },
    ],
    submissions: [
      {
        id: "submission-pending",
        student: { id: "student-active", fullName: "Active Student", email: "active@example.com" },
        assignment: { id: "assignment-1", title: "Algebra homework" },
        submittedAt: new Date("2026-07-10T12:00:00.000Z"),
        grade: null,
        feedback: null,
        status: "pending",
        review: {
          disabled: true,
          href: null,
          reason: "Teacher submission detail route is not implemented",
        },
      },
      {
        id: "submission-graded",
        student: {
          id: "student-inactive",
          fullName: "Inactive Student",
          email: "inactive@example.com",
        },
        assignment: { id: "assignment-1", title: "Algebra homework" },
        submittedAt: new Date("2026-07-10T12:30:00.000Z"),
        grade: 94,
        feedback: "Good work",
        status: "graded",
        review: {
          disabled: true,
          href: null,
          reason: "Teacher submission detail route is not implemented",
        },
      },
    ],
    gradingSummary: {
      totalSubmissions: 2,
      pendingSubmissions: 1,
      gradedSubmissions: 1,
    },
    progressSummary: {
      disabled: true,
      href: null,
      count: 0,
      reason: "Teacher progress route is not implemented",
    },
    attendanceSummary: {
      disabled: true,
      hidden: true,
      reason: "Attendance module is not implemented",
    },
    ...overrides,
  };
}

describe("Teacher schedule lesson detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    setupStartState();
    getTeacherLessonWorkspaceMock.mockResolvedValue(workspaceRecord());
  });

  afterEach(() => {
    cleanup();
  });

  it("requires TEACHER and renders owned lesson detail with roster and learning context", async () => {
    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    const { container } = render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "lesson-1");
    expect(screen.getByRole("heading", { name: /algebra live workshop/i })).toBeDefined();
    expect(screen.getByText(/teacher-facing lesson detail/i)).toBeDefined();
    expect(screen.getByText(/subject:\s*mathematics/i)).toBeDefined();
    expect(screen.getByText(/class group:\s*algebra group a/i)).toBeDefined();
    expect(screen.getByText(/status:\s*rescheduled/i)).toBeDefined();
    expect(screen.getByText(/europe\/kiev/i)).toBeDefined();
    expect(screen.getByText(/rescheduled from/i)).toBeDefined();
    expect(screen.getByText(/original time changed/i)).toBeDefined();

    const startLink = screen.getByRole("link", { name: /start lesson/i });
    expect(startLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(startLink).toHaveProperty("target", "_blank");
    expect(startLink).toHaveProperty("rel", "noreferrer");

    expect(screen.getByText(/^Active Student$/)).toBeDefined();
    const inactiveRow = screen.getByText(/^Inactive Student$/).closest("li");
    expect(inactiveRow).not.toBeNull();
    expect(inactiveRow?.textContent ?? "").toMatch(/inactive/i);
    expect(screen.getAllByText(/algebra worksheet/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/algebra homework/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pending submissions:\s*1/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 submissions/i)).toBeDefined();
    expect(screen.getByText(/1 pending/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /progress notes/i })).toBeDefined();
    expect(screen.getByText(/teacher progress route is not implemented/i)).toBeDefined();
    expect(container.textContent).not.toContain("https://meet.google.com/abc-defg-hij");
  });

  it("uses the enum-based server-side TEACHER page guard", () => {
    expectEnumTeacherGuardSource();
  });

  it("uses the teacher lesson workspace repository as the page data source", () => {
    expectEnumTeacherGuardSource();
    expectWorkspaceRepositorySource();
  });

  it("uses centralized lesson status labels without local conflicting lesson labels", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("LESSON_STATUS_LABELS");
    expect(source).not.toMatch(/function\s+formatStatus|const\s+formatStatus/);
    expect(source).not.toMatch(/\bPlanned\b|\bMoved\b|\bDone\b|\bCanceled\b/);
  });

  it("lets an active teacher render an owned lesson through the page guard", async () => {
    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "lesson-1");
    expect(screen.getByRole("heading", { name: /algebra live workshop/i })).toBeDefined();
  });

  it("calls getTeacherLessonWorkspace with the active teacher uid and renders an owned direct lesson workspace", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
      workspaceRecord({
        classGroup: null,
        navigationHrefs: {
          backToSchedule: "/portal/teacher/schedule",
          classDetail: {
            disabled: true,
            href: null,
            reason: "Lesson is not tied to a class group",
          },
          submissions: {
            disabled: true,
            href: null,
            reason: "Teacher submissions route is not implemented",
          },
          progress: {
            disabled: true,
            href: null,
            reason: "Teacher progress route is not implemented",
          },
          materials: {
            disabled: true,
            href: null,
            reason: "Teacher materials route is not implemented",
          },
          attendance: {
            disabled: true,
            href: null,
            reason: "Attendance module is not implemented",
          },
        },
      }),
    );
    getTeacherScheduleLessonMock.mockResolvedValueOnce(lessonRecord({ classGroup: null }));

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "lesson-1");
    expect(getTeacherScheduleLessonMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /lesson header/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /lesson actions/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /roster/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /materials/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /homework \/ assignments/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /submissions \/ grading/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /progress notes/i })).toBeDefined();
  });

  it("renders an owned classGroup lesson workspace with teacher navigation and no legacy schedule links", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(workspaceRecord());
    getTeacherScheduleLessonMock.mockResolvedValueOnce(lessonRecord());

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: Promise.resolve({ lessonId: "lesson-1" }) });
    const { container } = render(element);

    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "lesson-1");
    expect(screen.getByRole("link", { name: /back to schedule/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(screen.getByRole("link", { name: /class detail/i })).toHaveAttribute(
      "href",
      "/portal/teacher/classes/group-1",
    );
    expect(screen.queryByRole("link", { name: /review submissions/i })).toBeNull();
    expect(screen.getByText(/teacher submissions route is not implemented/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /progress notes/i })).toBeNull();
    expect(screen.getByText(/teacher progress route is not implemented/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /attendance/i })).toBeNull();
    expect(screen.getByText(/attendance module is not implemented/i)).toBeDefined();
    expect(container.querySelector('a[href="/portal/schedule"]')).toBeNull();
  });

  it("renders roster, materials, assignments, and submissions from the workspace view model", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(workspaceRecord());
    getTeacherScheduleLessonMock.mockResolvedValueOnce(lessonRecord());

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    expect(screen.getByText(/^Active Student$/)).toBeDefined();
    expect(screen.getByText(/^active@example\.com$/i)).toBeDefined();
    expect(screen.getByText(/learning status:\s*active/i)).toBeDefined();
    expect(screen.getByText(/submission status:\s*pending/i)).toBeDefined();
    expect(screen.getByText(/^Inactive Student$/)).toBeDefined();
    expect(screen.getByText(/learning status:\s*paused/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /edit student/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /student profile/i })).toBeNull();

    expect(screen.getAllByText(/algebra worksheet/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/practice file/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /open algebra worksheet/i })).toHaveAttribute(
      "href",
      "/uploads/algebra.pdf",
    );
    expect(screen.getByText(/01 july 2026/i)).toBeDefined();

    expect(screen.getAllByText(/algebra homework/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/due soon/i)).toBeDefined();
    expect(screen.getByText(/2 submissions/i)).toBeDefined();
    expect(screen.getByText(/1 pending/i)).toBeDefined();
    expect(screen.getAllByText(/review disabled/i).length).toBeGreaterThan(0);

    expect(screen.getByText(/pending submissions:\s*1/i)).toBeDefined();
    expect(screen.getByText(/graded submissions:\s*1/i)).toBeDefined();
    expect(screen.getByText(/94/i)).toBeDefined();
    expect(screen.getByText(/good work/i)).toBeDefined();
  });

  it("renders workspace empty states for materials, assignments, and submissions", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
      workspaceRecord({
        roster: [],
        materials: [],
        assignments: [],
        submissions: [],
        gradingSummary: {
          totalSubmissions: 0,
          pendingSubmissions: 0,
          gradedSubmissions: 0,
        },
      }),
    );
    getTeacherScheduleLessonMock.mockResolvedValueOnce(
      lessonRecord({
        rosterPreview: [],
        materials: [],
        assignments: [],
        submissionsSummary: { total: 0, pending: 0, graded: 0 },
      }),
    );

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-empty" } });
    render(element);

    expect(screen.getByText(/no students enrolled/i)).toBeDefined();
    expect(screen.getByText(/no materials/i)).toBeDefined();
    expect(screen.getByText(/no assignments/i)).toBeDefined();
    expect(screen.getByText(/no submissions/i)).toBeDefined();
  });

  it("renders disabled start state for cancelled lessons", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
      workspaceRecord({
        lesson: {
          ...workspaceRecord().lesson,
          status: "CANCELLED",
          cancelReason: "Teacher illness",
          startState: { enabled: false, href: null, reason: "Lesson is cancelled" },
        },
      }),
    );

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: Promise.resolve({ lessonId: "lesson-1" }) });
    render(element);

    expect(screen.queryByRole("link", { name: /start lesson/i })).toBeNull();
    expect(screen.getByText(/teacher illness/i)).toBeDefined();
    expect(screen.getByText(/lesson is cancelled/i)).toBeDefined();
  });

  it.each([
    ["CANCELLED", "Teacher illness", "Lesson is cancelled"],
    ["COMPLETED", null, "Lesson is completed"],
  ] as const)(
    "does not render an active Start Lesson link for %s workspace lessons",
    async (status, cancelReason, reason) => {
      getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
        workspaceRecord({
          lesson: {
            ...workspaceRecord().lesson,
            status,
            cancelReason,
            startState: { enabled: false, href: null, reason },
          },
        }),
      );
      getTeacherScheduleLessonMock.mockResolvedValueOnce(
        lessonRecord({
          status,
          cancelReason,
        }),
      );

      const page = await loadTeacherLessonDetailPage();
      const element = await page.default({ params: { lessonId: "lesson-1" } });
      render(element);

      expect(screen.queryByRole("link", { name: /start lesson/i })).toBeNull();
      if (cancelReason) {
        expect(screen.getByText(new RegExp(cancelReason, "i"))).toBeDefined();
      }
      expect(screen.getByText(reason)).toBeDefined();
    },
  );

  it.each([
    [null, "Meeting link missing"],
    ["javascript:alert(1)", "Meeting link missing"],
  ] as const)(
    "does not render unsafe or missing workspace start hrefs",
    async (liveLessonUrl, reason) => {
      getTeacherLessonWorkspaceMock.mockResolvedValueOnce(
        workspaceRecord({
          lesson: {
            ...workspaceRecord().lesson,
            liveLessonUrl,
            startState: { enabled: false, href: null, reason },
          },
        }),
      );
      getTeacherScheduleLessonMock.mockResolvedValueOnce(
        lessonRecord({
          liveLessonUrl,
        }),
      );

      const page = await loadTeacherLessonDetailPage();
      const element = await page.default({ params: { lessonId: "lesson-1" } });
      const { container } = render(element);

      expect(screen.queryByRole("link", { name: /start lesson/i })).toBeNull();
      expect(screen.getByText(reason)).toBeDefined();
      expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    },
  );

  it("renders valid workspace Start Lesson links with safe external attributes", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(workspaceRecord());
    getTeacherScheduleLessonMock.mockResolvedValueOnce(lessonRecord());

    const page = await loadTeacherLessonDetailPage();
    const element = await page.default({ params: { lessonId: "lesson-1" } });
    render(element);

    const startLink = screen.getByRole("link", { name: /start lesson/i });
    expect(startLink).toHaveProperty("href", "https://meet.google.com/abc-defg-hij");
    expect(startLink).toHaveProperty("target", "_blank");
    expect(startLink).toHaveProperty("rel", "noreferrer");
  });

  it("uses the shared TeacherStartLessonButton contract instead of local workspace start rendering", () => {
    const source = readFileSync("app/portal/teacher/lessons/[lessonId]/page.tsx", "utf8");

    expect(source).toContain("TeacherStartLessonButton");
    expect(source).not.toMatch(/function\s+StartLessonControl/);
    expect(source).not.toMatch(/startState\.enabled\s*&&\s*startState\.href/);
    expect(source).not.toMatch(/<a\s+href=\{startState\.href\}/);
  });

  it("returns notFound when another teacher tries to access the lesson", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(null);

    const page = await loadTeacherLessonDetailPage();

    await expect(page.default({ params: { lessonId: "other-teacher-lesson" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "other-teacher-lesson");
    expect(notFound).toHaveBeenCalled();
  });

  it("returns notFound when the workspace repository returns null", async () => {
    getTeacherLessonWorkspaceMock.mockResolvedValueOnce(null);
    getTeacherScheduleLessonMock.mockResolvedValueOnce(lessonRecord());

    const page = await loadTeacherLessonDetailPage();

    await expect(page.default({ params: { lessonId: "other-teacher-lesson" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getTeacherLessonWorkspaceMock).toHaveBeenCalledWith("teacher-1", "other-teacher-lesson");
    expect(notFound).toHaveBeenCalled();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions at the lesson detail page guard",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherLessonDetailPage();

      await expect(page.default({ params: { lessonId: "lesson-1" } })).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(getTeacherLessonWorkspaceMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before lesson lookup", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/portal/login?reason=invalid"));
    const page = await loadTeacherLessonDetailPage();

    await expect(page.default({ params: { lessonId: "lesson-1" } })).rejects.toThrow(
      "NEXT_REDIRECT:/portal/login?reason=invalid",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherLessonWorkspaceMock).not.toHaveBeenCalled();
  });
});
