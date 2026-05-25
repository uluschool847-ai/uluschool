import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
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

function loadParentReportsPage() {
  const specifier = "@/app/portal/parent/reports/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentReportsPageModule>;
}

describe("Parent child reports page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
    listReportSnapshotsForParentChildMock.mockResolvedValue([
      {
        academicTermName: "Spring 2026",
        childName: "Amina Yusuf",
        href: "/portal/parent/reports/student-1/snapshot-1",
        id: "snapshot-1",
        weightedTermAverage: 92,
      },
    ]);
  });

  afterEach(() => cleanup());

  it("uses PARENT guard, linked-child repository, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/parent/reports/[studentId]/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("listReportSnapshotsForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("lists reports only for a linked child", async () => {
    const page = await loadParentReportsPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { termId: "term-1" },
    });
    render(element);

    expect(listReportSnapshotsForParentChildMock).toHaveBeenCalledWith("parent-1", "student-1", {
      termId: "term-1",
    });
    expect(screen.getByRole("heading", { name: /reports/i })).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view report/i })).toHaveAttribute(
      "href",
      "/portal/parent/reports/student-1/snapshot-1",
    );
  });

  it("renders empty state for unlinked or missing child reports", async () => {
    listReportSnapshotsForParentChildMock.mockResolvedValueOnce([]);
    const page = await loadParentReportsPage();
    const element = await page.default({ params: { studentId: "unlinked-student" } });
    render(element);

    expect(screen.getByText(/no reports available for this student/i)).toBeDefined();
  });
});
