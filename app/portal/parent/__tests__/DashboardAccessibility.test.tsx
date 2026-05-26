import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getParentDashboardDataMock = vi.hoisted(() => vi.fn());
const legacyGetParentDashboardDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/parent-dashboard-repository", () => ({
  getParentDashboardData: getParentDashboardDataMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getParentDashboardData: legacyGetParentDashboardDataMock,
}));

import ParentDashboardPage from "@/app/portal/parent/page";

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

function childDashboard(overrides: Record<string, unknown> = {}) {
  return {
    assignmentsSummary: { pendingCount: 0, recentGradedCount: 0, nextPending: null },
    attendanceSummary: null,
    childName: "Amina One",
    fullName: "Amina One",
    gradebookSummary: { currentTermAverage: null, termName: null },
    id: "child-1",
    materialsSummary: { latestMaterial: null, totalCount: 0 },
    progressSummary: { latestNote: null },
    quickLinks: [
      { href: "/portal/parent/schedule?studentId=child-1", label: "Open schedule" },
      { href: "/portal/parent/assignments/child-1", label: "Open assignments" },
      { href: "/portal/parent/materials/child-1", label: "Open materials" },
      { href: "/portal/parent/attendance/child-1", label: "Open attendance" },
      { href: "/portal/parent/progress/child-1", label: "Open progress" },
      { href: "/portal/parent/gradebook/child-1", label: "Open gradebook" },
      { href: "/portal/parent/reports/child-1", label: "Open reports" },
    ],
    reportsSummary: { latestReport: null },
    scheduleSummary: { nextLesson: null, todayCount: 0, upcomingCount: 0 },
    ...overrides,
  };
}

function dashboardData(children = [childDashboard()]) {
  return { children };
}

function mockDashboardData(data: ReturnType<typeof dashboardData>) {
  getParentDashboardDataMock.mockResolvedValue(data);
  legacyGetParentDashboardDataMock.mockResolvedValue(data);
}

describe("Parent dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: "PARENT" });
    mockDashboardData(dashboardData());
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps a single page-level h1 even when multiple children are shown", async () => {
    mockDashboardData(
      dashboardData([
        childDashboard({ childName: "Amina One", fullName: "Amina One", id: "child-1" }),
        childDashboard({ childName: "Amina Two", fullName: "Amina Two", id: "child-2" }),
      ]),
    );

    await renderServerComponent(<ParentDashboardPage />);

    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("requests dashboard data for the signed-in parent through the finalized dashboard repository", async () => {
    mockDashboardData(
      dashboardData([
        childDashboard({ childName: "Sofia Shevchenko", fullName: "Sofia Shevchenko" }),
        childDashboard({
          childName: "Mark Shevchenko",
          fullName: "Mark Shevchenko",
          id: "child-2",
        }),
      ]),
    );

    await renderServerComponent(<ParentDashboardPage />);

    expect(requireRoleMock).toHaveBeenCalledWith(["PARENT"]);
    expect(getParentDashboardDataMock).toHaveBeenCalledWith("parent-1");
    expect(legacyGetParentDashboardDataMock).not.toHaveBeenCalled();
    expect(screen.getByText("Sofia Shevchenko")).not.toBeNull();
    expect(screen.getByText("Mark Shevchenko")).not.toBeNull();
    expect(screen.queryByText("Unlinked Student")).toBeNull();
  });

  it("announces the no-linked-students state instead of rendering a silent text block", async () => {
    mockDashboardData(dashboardData([]));

    await renderServerComponent(<ParentDashboardPage />);

    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.getByText(/no linked students found/i)).not.toBeNull();
  });

  it("uses labeled region landmarks for each child and each dashboard summary card", async () => {
    mockDashboardData(
      dashboardData([
        childDashboard({
          assignmentsSummary: { pendingCount: 1, recentGradedCount: 1, nextPending: null },
          attendanceSummary: { attendanceRate: 87.5, totalCount: 14 },
          childName: "Amina One",
          fullName: "Amina One",
          gradebookSummary: { currentTermAverage: 84.7, termName: "Spring 2026" },
          materialsSummary: { latestMaterial: { title: "Graphing worksheet" }, totalCount: 3 },
          progressSummary: { latestNote: { content: "Strong algebra progress." } },
          reportsSummary: { latestReport: { termName: "Spring 2026" } },
          scheduleSummary: {
            nextLesson: { title: "Quadratic functions", subjectName: "Mathematics" },
            upcomingCount: 2,
          },
        }),
      ]),
    );

    await renderServerComponent(<ParentDashboardPage />);

    expect(screen.getByRole("region", { name: /^dashboard for amina one$/i })).toBeDefined();
    for (const name of [
      /amina one schedule/i,
      /amina one assignments/i,
      /amina one materials/i,
      /amina one attendance/i,
      /amina one progress/i,
      /amina one gradebook/i,
      /amina one reports/i,
    ]) {
      expect(screen.getByRole("region", { name })).toBeDefined();
    }
  });

  it("uses descriptive quick-link names instead of repeated ambiguous View links", async () => {
    await renderServerComponent(<ParentDashboardPage />);

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

  it("renders subject names for linked children's upcoming classes", async () => {
    mockDashboardData(
      dashboardData([
        childDashboard({
          scheduleSummary: {
            nextLesson: {
              classGroupName: "IGCSE Mathematics Group A",
              subjectName: "Mathematics",
              title: "Quadratic functions",
            },
            upcomingCount: 1,
          },
        }),
      ]),
    );

    await renderServerComponent(<ParentDashboardPage />);

    expect(getParentDashboardDataMock).toHaveBeenCalledWith("parent-1");
    expect(screen.getByText("Quadratic functions")).not.toBeNull();
    expect(screen.getByText(/^Group: IGCSE Mathematics Group A$/i)).not.toBeNull();
    expect(screen.getByText(/^Subject: Mathematics$/i)).not.toBeNull();
    expect(screen.queryByText("Unrelated Group Lesson")).toBeNull();
  });

  it("keeps dashboard cards stacked on mobile and only splits them from the md breakpoint", async () => {
    setViewport(375);
    const { container } = await renderServerComponent(<ParentDashboardPage />);

    const columns = Array.from(container.querySelectorAll("div")).find((node) =>
      /\bmd:grid-cols-\d\b/.test(node.className),
    );

    expect(columns).toBeTruthy();
    expect(columns?.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});
