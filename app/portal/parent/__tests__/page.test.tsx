import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
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

type ParentDashboardPageModule = {
  default: () => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/page.tsx";

async function loadDashboardPage() {
  const specifier = "@/app/portal/parent/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentDashboardPageModule>;
}

function childDashboard(overrides: Record<string, unknown> = {}) {
  return {
    assignmentsSummary: {
      overdueCount: 0,
      pendingCount: 2,
      recentGradedCount: 1,
      nextPending: {
        dueDate: new Date("2026-06-20T20:00:00.000Z"),
        href: "/portal/parent/assignments/student-1/assignment-1",
        title: "Quadratic equations",
      },
    },
    attendanceSummary: {
      absentCount: 1,
      attendanceRate: 87.5,
      lateCount: 1,
      presentCount: 12,
      totalCount: 14,
    },
    childName: "Sofia Shevchenko",
    fullName: "Sofia Shevchenko",
    gradebookSummary: {
      currentTermAverage: 84.7,
      termName: "Spring 2026",
    },
    homeworkStatus: [],
    id: "student-1",
    materialsSummary: {
      latestMaterial: {
        href: "/portal/parent/materials/student-1",
        title: "Graphing worksheet",
      },
      totalCount: 3,
    },
    progressSummary: {
      latestNote: {
        content: "Strong algebra progress.",
        recordedAt: new Date("2026-06-01T10:00:00.000Z"),
        subjectName: "Mathematics",
      },
    },
    quickLinks: [
      { href: "/portal/parent/schedule?studentId=student-1", label: "Open schedule" },
      { href: "/portal/parent/assignments/student-1", label: "Open assignments" },
      { href: "/portal/parent/materials/student-1", label: "Open materials" },
      { href: "/portal/parent/attendance/student-1", label: "Open attendance" },
      { href: "/portal/parent/progress/student-1", label: "Open progress" },
      { href: "/portal/parent/gradebook/student-1", label: "Open gradebook" },
      { href: "/portal/parent/reports/student-1", label: "Open reports" },
    ],
    recentGrades: [],
    reportsSummary: {
      latestReport: {
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/parent/reports/student-1/snapshot-1",
        termName: "Spring 2026",
        weightedTermAverage: 92,
      },
    },
    scheduleSummary: {
      nextLesson: {
        href: "/portal/parent/schedule/student-1/lesson-1",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        subjectName: "Mathematics",
        teacherName: "Jane Teacher",
        title: "Algebra lesson",
      },
      todayCount: 1,
      upcomingCount: 2,
    },
    structuredProgress: { attendance: "legacy", completedAssignments: "legacy" },
    upcomingClasses: [],
    ...overrides,
  };
}

function dashboardData(overrides: Record<string, unknown> = {}) {
  const children = [childDashboard()];
  return {
    children,
    ...overrides,
  };
}

describe("Parent dashboard final hub", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      email: "parent@example.com",
      role: UserRole.PARENT,
      uid: "parent-1",
    });
    getParentDashboardDataMock.mockResolvedValue(dashboardData());
    legacyGetParentDashboardDataMock.mockResolvedValue([childDashboard()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the PARENT guard and routes all dashboard data through the dedicated parent dashboard API", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-dashboard-repository");
    expect(source).toContain("getParentDashboardData(session.uid)");
    expect(source).not.toContain("@/lib/repositories/portal-repository");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("structuredProgress");
    expect(source).not.toContain('"95%"');
    expect(source).not.toContain("completedAssignments");
  });

  it("loads the finalized parent dashboard hub using session.uid", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentDashboardDataMock).toHaveBeenCalledWith("parent-1");
    expect(legacyGetParentDashboardDataMock).not.toHaveBeenCalled();
  });

  it("renders linked child academic summary cards and all parent workflow links", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    const childRegion = screen.getByRole("region", {
      name: /^dashboard for sofia shevchenko$/i,
    });
    for (const section of [
      "Schedule",
      "Assignments",
      "Materials",
      "Attendance",
      "Progress",
      "Gradebook",
      "Reports",
    ]) {
      expect(within(childRegion).getByRole("heading", { name: section })).toBeDefined();
    }

    expect(within(childRegion).getByText(/algebra lesson/i)).toBeDefined();
    expect(within(childRegion).getByText(/teacher:\s*jane teacher/i)).toBeDefined();
    expect(within(childRegion).getByText(/pending assignments:\s*2/i)).toBeDefined();
    expect(within(childRegion).getByText(/recently graded:\s*1/i)).toBeDefined();
    expect(within(childRegion).getByText(/materials:\s*3/i)).toBeDefined();
    expect(within(childRegion).getByText(/attendance rate:\s*87\.5%/i)).toBeDefined();
    expect(within(childRegion).getByText(/strong algebra progress/i)).toBeDefined();
    expect(within(childRegion).getByText(/grade average:\s*84\.7/i)).toBeDefined();
    expect(within(childRegion).getByText(/latest report:\s*spring 2026/i)).toBeDefined();

    for (const [name, href] of [
      [/open schedule/i, "/portal/parent/schedule?studentId=student-1"],
      [/open assignments/i, "/portal/parent/assignments/student-1"],
      [/open materials/i, "/portal/parent/materials/student-1"],
      [/open attendance/i, "/portal/parent/attendance/student-1"],
      [/open progress/i, "/portal/parent/progress/student-1"],
      [/open gradebook/i, "/portal/parent/gradebook/student-1"],
      [/open reports/i, "/portal/parent/reports/student-1"],
    ] as const) {
      expect(within(childRegion).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("renders a read-only dashboard without mutation controls or student-facing submission forms", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(
      screen.queryByLabelText(/upload file|submit work|feedback input|grade input/i),
    ).toBeNull();
    expect(screen.queryByText(/google drive|dropbox|submit homework|save grade/i)).toBeNull();
  });

  it("renders linked children only and never leaks unlinked child summaries", async () => {
    getParentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        children: [
          childDashboard(),
          childDashboard({
            childName: "Mark Shevchenko",
            fullName: "Mark Shevchenko",
            id: "student-2",
            quickLinks: [
              { href: "/portal/parent/schedule?studentId=student-2", label: "Open schedule" },
            ],
          }),
        ],
      }),
    );
    legacyGetParentDashboardDataMock.mockResolvedValueOnce([
      childDashboard(),
      childDashboard({
        childName: "Mark Shevchenko",
        fullName: "Mark Shevchenko",
        id: "student-2",
      }),
    ]);

    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByText("Sofia Shevchenko")).toBeDefined();
    expect(screen.getByText("Mark Shevchenko")).toBeDefined();
    expect(screen.queryByText("Unlinked Student")).toBeNull();
    expect(screen.queryByText("Foreign assignment")).toBeNull();
  });

  it("renders accessible empty states when a linked child has no academic activity", async () => {
    getParentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        children: [
          childDashboard({
            assignmentsSummary: { pendingCount: 0, recentGradedCount: 0, nextPending: null },
            attendanceSummary: null,
            gradebookSummary: { currentTermAverage: null, termName: null },
            materialsSummary: { latestMaterial: null, totalCount: 0 },
            progressSummary: { latestNote: null },
            reportsSummary: { latestReport: null },
            scheduleSummary: { nextLesson: null, todayCount: 0, upcomingCount: 0 },
          }),
        ],
      }),
    );

    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

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

  it("renders a read-only parent profile card with a safe profile link", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    const profileRegion = screen.getByRole("region", { name: /parent profile/i });

    expect(within(profileRegion).getByRole("heading", { name: /profile/i })).toBeDefined();
    expect(within(profileRegion).getByText(/account and linked children/i)).toBeDefined();
    expect(within(profileRegion).getByRole("link", { name: /open profile/i })).toHaveAttribute(
      "href",
      "/portal/parent/profile",
    );
    expect(within(profileRegion).queryByText(/parent-1|student-1/i)).toBeNull();
    expect(
      within(profileRegion).queryByRole("link", { name: /javascript:|data:|file:|http:/i }),
    ).toBeNull();
    expect(
      within(profileRegion).queryByRole("button", { name: /edit|save|password|link child/i }),
    ).toBeNull();
  });

  it("rejects wrong roles before loading parent dashboard data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadDashboardPage();

    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentDashboardDataMock).not.toHaveBeenCalled();
    expect(legacyGetParentDashboardDataMock).not.toHaveBeenCalled();
  });
});
