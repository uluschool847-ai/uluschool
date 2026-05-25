import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getStudentDashboardDataMock = vi.hoisted(() => vi.fn());
const listAssignmentsForStudentMock = vi.hoisted(() => vi.fn());
const listProgressNotesForStudentMock = vi.hoisted(() => vi.fn());
const getStudentGradebookMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForStudentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-dashboard-repository", () => ({
  getStudentDashboardData: getStudentDashboardDataMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  listAssignmentsForStudent: listAssignmentsForStudentMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listProgressNotesForStudent: listProgressNotesForStudentMock,
}));

vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getStudentGradebook: getStudentGradebookMock,
}));

vi.mock("@/lib/repositories/report-repository", () => ({
  listReportSnapshotsForStudent: listReportSnapshotsForStudentMock,
}));

import StudentDashboardPage from "@/app/portal/student/page";

const fullMonthDateRegex =
  /\b\d{2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}(?!\d)/;
const shortMonthRegex = /\b\d{2} (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b \d{4}(?!\d)/;
async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

function dashboardData(overrides: Record<string, unknown> = {}) {
  return {
    assignmentsSummary: {
      pendingCount: 2,
      recentGradedCount: 1,
      nextPending: {
        dueDate: new Date("2026-09-08T00:00:00.000Z"),
        href: "/portal/student/assignments/assignment-1",
        title: "Quadratic Equations",
      },
    },
    attendanceSummary: {
      absentCount: 1,
      attendanceRate: 87.5,
      lateCount: 1,
      presentCount: 12,
      totalCount: 14,
    },
    gradebookSummary: { currentTermAverage: 84.7, termName: "Spring 2026" },
    materialsSummary: {
      latestMaterial: { href: "/portal/student/materials", title: "Graphing worksheet" },
      totalCount: 3,
    },
    progressSummary: {
      latestNote: {
        content: "Strong algebra progress.",
        recordedAt: new Date("2026-09-06T09:00:00.000Z"),
        subjectName: "Mathematics",
      },
    },
    reportsSummary: {
      latestReport: {
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/student/reports/snapshot-1",
        termName: "Spring 2026",
        weightedTermAverage: 92,
      },
    },
    scheduleSummary: {
      nextLesson: {
        href: "/portal/student/schedule/lesson-1",
        startAt: new Date("2026-09-09T09:00:00.000Z"),
        title: "IGCSE Mathematics",
      },
      todayCount: 1,
      upcomingCount: 2,
    },
    student: { email: "student@example.com", fullName: "Student One", id: "student-1" },
    ...overrides,
  };
}

describe("Student dashboard formatting consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
    });
    listAssignmentsForStudentMock.mockResolvedValue([
      {
        id: "assignment-1",
        title: "Quadratic Equations",
        descriptionPreview: "Solve the attached worksheet.",
        dueDate: new Date("2026-09-08T00:00:00.000Z"),
        status: "Not submitted",
        detailHref: "/portal/student/assignments/assignment-1",
        subject: { id: "subject-1", name: "Mathematics" },
        scheduledClass: { id: "lesson-1", title: "IGCSE Mathematics" },
        classGroup: null,
        currentSubmission: null,
      },
    ]);
    listProgressNotesForStudentMock.mockResolvedValue([
      {
        id: "progress-1",
        subject: { id: "subject-1", name: "Mathematics" },
        performanceLevel: "GOOD",
        teacherNotes: "Strong algebra progress.",
        recordedAt: new Date("2026-09-06T09:00:00.000Z"),
        updatedAt: new Date("2026-09-07T09:00:00.000Z"),
        archivedAt: null,
        teacher: { id: "teacher-1", fullName: "Teacher One", name: "Teacher One" },
        statusLabel: "Active",
      },
    ]);
    getStudentGradebookMock.mockResolvedValue(null);
    listReportSnapshotsForStudentMock.mockResolvedValue([]);
    getStudentDashboardDataMock.mockResolvedValue(dashboardData());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders dashboard dates with one full-month date style", async () => {
    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(fullMonthDateRegex);
    expect(text).not.toMatch(shortMonthRegex);
  });

  it("renders numeric summaries with stable labels", async () => {
    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/pending assignments:\s*2/i);
    expect(text).toMatch(/recently graded:\s*1/i);
    expect(text).toMatch(/attendance rate:\s*87\.5%/i);
    expect(text).toMatch(/present:\s*12/i);
    expect(text).toMatch(/late:\s*1/i);
    expect(text).toMatch(/absent:\s*1/i);
    expect(text).toMatch(/grade average:\s*84\.7/i);
    expect(text).toMatch(/report average:\s*92/i);
    expect(text).not.toMatch(/Grade:\s+[A-F][+-]?|A Plus|B Plus|C Minus/i);
  });

  it("does not render raw ids, unsafe URLs, or serialized objects in the dashboard UI", async () => {
    getStudentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        assignmentsSummary: {
          pendingCount: 1,
          recentGradedCount: 0,
          nextPending: {
            dueDate: new Date("2026-09-08T00:00:00.000Z"),
            href: "/portal/student/assignments/assignment-raw-id",
            title: "Safe assignment title",
          },
        },
        materialsSummary: {
          latestMaterial: {
            href: "javascript:alert(1)",
            title: "Safe material title",
          },
          totalCount: 1,
        },
        student: {
          email: "student@example.com",
          fullName: "Student One",
          id: "student-raw-id",
        },
      }),
    );

    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toContain("Safe assignment title");
    expect(text).toContain("Safe material title");
    expect(text).not.toContain("student-raw-id");
    expect(text).not.toContain("assignment-raw-id");
    expect(text).not.toMatch(/javascript:|data:|file:|http:\/\/|\[object Object\]|\{\"/i);
  });

  it("uses one consistent wording for student dashboard labels and avoids alternate portal terminology", async () => {
    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toContain("Student Dashboard");
    expect(text).toContain("My Assignments");
    expect(text).toContain("My Progress");
    expect(text).not.toMatch(/Students Portal|Learner Portal/i);
  });
});
