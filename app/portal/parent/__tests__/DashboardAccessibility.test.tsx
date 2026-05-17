import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getParentDashboardDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getParentDashboardData: getParentDashboardDataMock,
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

describe("Parent dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: "PARENT" });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps a single page-level h1 even when multiple children are shown", async () => {
    getParentDashboardDataMock.mockResolvedValue([
      {
        id: "child-1",
        childName: "Amina One",
        upcomingClasses: [],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "95%", completedAssignments: "8/10" },
      },
      {
        id: "child-2",
        childName: "Amina Two",
        upcomingClasses: [],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "92%", completedAssignments: "7/10" },
      },
    ]);

    await renderServerComponent(<ParentDashboardPage />);

    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("requests dashboard data for the signed-in parent and renders only linked children", async () => {
    getParentDashboardDataMock.mockResolvedValue([
      {
        id: "child-1",
        childName: "Sofia Shevchenko",
        upcomingClasses: [],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "95%", completedAssignments: "8/10" },
      },
      {
        id: "child-2",
        childName: "Mark Shevchenko",
        upcomingClasses: [],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "92%", completedAssignments: "7/10" },
      },
    ]);

    await renderServerComponent(<ParentDashboardPage />);

    expect(requireRoleMock).toHaveBeenCalledWith(["PARENT"]);
    expect(getParentDashboardDataMock).toHaveBeenCalledWith("parent-1");
    expect(screen.getByText("Sofia Shevchenko")).not.toBeNull();
    expect(screen.getByText("Mark Shevchenko")).not.toBeNull();
    expect(screen.queryByText("Unlinked Student")).toBeNull();
  });

  it("announces the no-linked-students state instead of rendering a silent text block", async () => {
    getParentDashboardDataMock.mockResolvedValue([]);

    await renderServerComponent(<ParentDashboardPage />);

    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.getByText(/no linked students found/i)).not.toBeNull();
  });

  it("uses labeled section landmarks for the child dashboard regions", async () => {
    getParentDashboardDataMock.mockResolvedValue([
      {
        id: "child-1",
        childName: "Amina One",
        upcomingClasses: [],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "95%", completedAssignments: "8/10" },
      },
    ]);

    const { container } = await renderServerComponent(<ParentDashboardPage />);

    const labeledSections = container.querySelectorAll(
      "section[aria-label], section[aria-labelledby]",
    );
    expect(labeledSections.length).toBeGreaterThanOrEqual(4);
  });

  it("renders subject names for linked children's upcoming classes", async () => {
    getParentDashboardDataMock.mockResolvedValue([
      {
        id: "child-1",
        childName: "Amina One",
        upcomingClasses: [
          {
            id: "class-1",
            title: "Quadratic functions",
            teacher: "Jane Teacher",
            time: "01 June 2026, 10:00",
            subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
            classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
          },
        ],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "95%", completedAssignments: "8/10" },
      },
    ]);

    await renderServerComponent(<ParentDashboardPage />);

    expect(getParentDashboardDataMock).toHaveBeenCalledWith("parent-1");
    expect(screen.getByText("Quadratic functions")).not.toBeNull();
    expect(screen.getByText(/^Group: IGCSE Mathematics Group A$/i)).not.toBeNull();
    expect(screen.getByText(/^Subject: Mathematics$/i)).not.toBeNull();
    expect(screen.queryByText("Unrelated Group Lesson")).toBeNull();
  });

  it("stacks the overall progress cards on mobile instead of forcing a two-column base grid", async () => {
    setViewport(375);
    getParentDashboardDataMock.mockResolvedValue([
      {
        id: "child-1",
        childName: "Amina One",
        upcomingClasses: [],
        homeworkStatus: [],
        recentGrades: [],
        structuredProgress: { attendance: "95%", completedAssignments: "8/10" },
      },
    ]);

    const { container } = await renderServerComponent(<ParentDashboardPage />);

    const progressGrid = Array.from(container.querySelectorAll("div")).find((node) =>
      node.className.includes("grid-cols-2 gap-6"),
    );

    expect(progressGrid).toBeTruthy();
    expect(progressGrid?.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});
