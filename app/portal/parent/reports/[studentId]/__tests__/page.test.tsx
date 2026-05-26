import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  listReportSnapshotsForParentChild: listReportSnapshotsForParentChildMock,
}));

type ParentReportsPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/reports/[studentId]/page.tsx";

function loadParentReportsPage() {
  const specifier = "@/app/portal/parent/reports/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentReportsPageModule>;
}

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    academicTermName: "Spring 2026",
    childName: "Amina Yusuf",
    classGroupName: "Algebra Group A",
    generatedAt: new Date("2026-05-20T10:00:00.000Z"),
    href: "/portal/parent/reports/student-1/snapshot-1",
    id: "snapshot-1",
    pdfAvailable: true,
    teacherCommentPreview: "Keep practicing transformations.",
    weightedTermAverage: 92,
    ...overrides,
  };
}

describe("Parent child reports page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    listReportSnapshotsForParentChildMock.mockResolvedValue([reportRow()]);
  });

  afterEach(() => cleanup());

  it("uses PARENT guard, linked-child repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("listReportSnapshotsForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("passes session.uid, route studentId, and report filters to the parent-scoped repository", async () => {
    const page = await loadParentReportsPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: {
        classGroupId: "group-1",
        search: "transformations",
        sort: "term",
        termId: "term-1",
      },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(listReportSnapshotsForParentChildMock).toHaveBeenCalledWith("parent-1", "student-1", {
      classGroupId: "group-1",
      search: "transformations",
      sort: "term",
      termId: "term-1",
    });
  });

  it("renders report filters and linked-child report rows", async () => {
    const page = await loadParentReportsPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByRole("heading", { name: /reports/i })).toBeDefined();
    expect(screen.getByLabelText("Term")).toBeDefined();
    expect(screen.getByLabelText("Class group")).toBeDefined();
    expect(screen.getByLabelText("Search")).toBeDefined();
    expect(screen.getByLabelText("Sort")).toBeDefined();

    const row = screen.getByRole("article", { name: /spring 2026/i });
    expect(within(row).getByText(/amina yusuf/i)).toBeDefined();
    expect(within(row).getByText(/algebra group a/i)).toBeDefined();
    expect(within(row).getByText(/20 May 2026/i)).toBeDefined();
    expect(within(row).getByText(/weighted average:\s*92/i)).toBeDefined();
    expect(within(row).getByText(/keep practicing/i)).toBeDefined();
    expect(within(row).getByText(/pdf available/i)).toBeDefined();
    expect(within(row).getByRole("link", { name: /view report/i })).toHaveAttribute(
      "href",
      "/portal/parent/reports/student-1/snapshot-1",
    );
    expect(screen.queryByText(/foreign report/i)).toBeNull();
  });

  it("renders empty state for unlinked or missing child reports", async () => {
    listReportSnapshotsForParentChildMock.mockResolvedValueOnce([]);
    const page = await loadParentReportsPage();
    const element = await page.default({ params: { studentId: "unlinked-student" } });
    render(element);

    expect(screen.getByText(/no reports available for this student/i)).toBeDefined();
  });

  it("renders no mutation controls", async () => {
    const page = await loadParentReportsPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    for (const label of [/export/i, /regenerate/i, /delete/i, /save/i]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });
});
