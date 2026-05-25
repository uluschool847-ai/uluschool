import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  listReportSnapshotsForTeacher: listReportSnapshotsForTeacherMock,
}));

type ReportsPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadReportsPage() {
  const specifier = "@/app/portal/teacher/reports/page";
  return import(/* @vite-ignore */ specifier) as Promise<ReportsPageModule>;
}

describe("Teacher reports page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listReportSnapshotsForTeacherMock.mockResolvedValue([
      {
        id: "snapshot-1",
        studentName: "Amina Yusuf",
        classGroupName: "Algebra Group A",
        academicTermName: "Spring 2026",
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/teacher/reports/snapshot-1",
      },
    ]);
  });

  afterEach(() => cleanup());

  it("uses TEACHER guard, report repository, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/teacher/reports/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("listReportSnapshotsForTeacher(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("lists teacher-scoped snapshots with filters and preview entry point", async () => {
    const page = await loadReportsPage();
    const element = await page.default({
      searchParams: { classGroupId: "group-1", studentId: "student-1", termId: "term-1" },
    });
    render(element);

    expect(listReportSnapshotsForTeacherMock).toHaveBeenCalledWith("teacher-1", {
      classGroupId: "group-1",
      studentId: "student-1",
      termId: "term-1",
    });
    expect(screen.getByRole("heading", { name: /reports/i })).toBeDefined();
    expect(screen.getByLabelText(/student/i)).toBeDefined();
    expect(screen.getByLabelText(/class\/group/i)).toBeDefined();
    expect(screen.getByLabelText(/academic term/i)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /generate report preview/i }).getAttribute("href"),
    ).toEqual(expect.stringContaining("/portal/teacher/reports/preview"));
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view report/i })).toHaveAttribute(
      "href",
      "/portal/teacher/reports/snapshot-1",
    );
  });

  it("renders empty state", async () => {
    listReportSnapshotsForTeacherMock.mockResolvedValueOnce([]);
    const page = await loadReportsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no saved reports yet/i)).toBeDefined();
  });
});
