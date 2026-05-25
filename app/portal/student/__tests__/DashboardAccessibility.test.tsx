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

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1024") ? width >= 1024 : width < 1024,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

function dashboardData(overrides: Record<string, unknown> = {}) {
  return {
    assignmentsSummary: { pendingCount: 0, recentGradedCount: 0, nextPending: null },
    attendanceSummary: null,
    gradebookSummary: { currentTermAverage: null, termName: null },
    materialsSummary: { latestMaterial: null, totalCount: 0 },
    progressSummary: { latestNote: null },
    quickLinks: [
      { href: "/portal/student/schedule", label: "Open schedule" },
      { href: "/portal/student/assignments", label: "Open assignments" },
      { href: "/portal/student/materials", label: "Open materials" },
      { href: "/portal/student/attendance", label: "Open attendance" },
      { href: "/portal/student/progress", label: "Open progress" },
      { href: "/portal/student/gradebook", label: "Open gradebook" },
      { href: "/portal/student/reports", label: "Open reports" },
    ],
    reportsSummary: { latestReport: null },
    scheduleSummary: { nextLesson: null, todayCount: 0, upcomingCount: 0 },
    student: { email: "student@example.com", fullName: "Student One", id: "student-1" },
    ...overrides,
  };
}

describe("Student dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
    });
    listAssignmentsForStudentMock.mockResolvedValue([]);
    listProgressNotesForStudentMock.mockResolvedValue([]);
    getStudentGradebookMock.mockResolvedValue(null);
    listReportSnapshotsForStudentMock.mockResolvedValue([]);
    getStudentDashboardDataMock.mockResolvedValue(dashboardData());
  });

  afterEach(() => {
    cleanup();
  });

  it("wraps the dashboard in a main landmark and exposes a single h1", async () => {
    await renderServerComponent(<StudentDashboardPage />);

    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("does not skip heading levels between the page title and card section titles", async () => {
    await renderServerComponent(<StudentDashboardPage />);

    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(7);
    for (const section of [
      "Schedule",
      "Assignments",
      "Materials",
      "Attendance",
      "Progress",
      "Gradebook",
      "Reports",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeDefined();
    }
  });

  it("announces final empty dashboard regions with role=status", async () => {
    await renderServerComponent(<StudentDashboardPage />);

    expect(screen.getByRole("status", { name: /schedule/i })).toHaveTextContent(
      /no upcoming lessons/i,
    );
    expect(screen.getByRole("status", { name: /assignments/i })).toHaveTextContent(
      /no pending assignments/i,
    );
    expect(screen.getByRole("status", { name: /materials/i })).toHaveTextContent(/no materials/i);
    expect(screen.getByRole("status", { name: /attendance/i })).toHaveTextContent(
      /no attendance records/i,
    );
    expect(screen.getByRole("status", { name: /progress/i })).toHaveTextContent(
      /no progress notes/i,
    );
    expect(screen.getByRole("status", { name: /gradebook/i })).toHaveTextContent(
      /no grade average/i,
    );
    expect(screen.getByRole("status", { name: /reports/i })).toHaveTextContent(/no reports/i);
  });

  it("uses descriptive quick-link names instead of repeated ambiguous View links", async () => {
    await renderServerComponent(<StudentDashboardPage />);

    expect(screen.queryByRole("link", { name: /^view$/i })).toBeNull();
    for (const name of [
      /open schedule/i,
      /open assignments/i,
      /open materials/i,
      /open attendance/i,
      /open progress/i,
      /open gradebook/i,
      /open reports/i,
    ]) {
      expect(screen.getByRole("link", { name })).toBeDefined();
    }
  });

  it("keeps dashboard columns stacked on mobile and only splits them from the md breakpoint", async () => {
    setViewport(375);
    const { container } = await renderServerComponent(<StudentDashboardPage />);

    const columns = Array.from(container.querySelectorAll("div")).find((node) =>
      /\bmd:grid-cols-\d\b/.test(node.className),
    );

    expect(columns).toBeTruthy();
    expect(columns?.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});
