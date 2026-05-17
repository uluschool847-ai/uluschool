import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listStudentHomeworkMock = vi.hoisted(() => vi.fn());
const getStudentProgressMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  listStudentHomework: listStudentHomeworkMock,
  getStudentProgress: getStudentProgressMock,
}));

vi.mock("@/app/portal/actions", () => ({
  submitHomeworkAction: vi.fn(),
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

describe("Student dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
    });
    listStudentHomeworkMock.mockResolvedValue([]);
    getStudentProgressMock.mockResolvedValue([]);
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

    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(2);
  });

  it("announces empty assignments and progress regions with role=status", async () => {
    await renderServerComponent(<StudentDashboardPage />);

    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps dashboard columns stacked on mobile and only splits them from the md breakpoint", async () => {
    setViewport(375);
    const { container } = await renderServerComponent(<StudentDashboardPage />);

    const columns = Array.from(container.querySelectorAll("div")).find((node) =>
      node.className.includes("md:grid-cols-2"),
    );

    expect(columns).toBeTruthy();
    expect(columns?.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});
