import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForStudentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  listReportSnapshotsForStudent: listReportSnapshotsForStudentMock,
}));

type StudentReportsPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadStudentReportsPage() {
  const specifier = "@/app/portal/student/reports/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentReportsPageModule>;
}

describe("Student reports page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    listReportSnapshotsForStudentMock.mockResolvedValue([
      {
        academicTerm: { id: "term-1", name: "Spring 2026" },
        academicTermName: "Spring 2026",
        classGroup: { id: "group-1", name: "Algebra Group A" },
        classGroupName: "Algebra Group A",
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/student/reports/snapshot-1",
        id: "snapshot-1",
        pdfAvailable: true,
        teacherCommentPreview: "Keep practicing",
        weightedTermAverage: 92,
      },
    ]);
  });

  afterEach(() => cleanup());

  it("uses STUDENT guard, student-scoped report repository, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/student/reports/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("listReportSnapshotsForStudent(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("lists only the session student's saved reports with filters and PDF state", async () => {
    const page = await loadStudentReportsPage();
    const element = await page.default({
      searchParams: {
        classGroupId: "group-1",
        search: "practice",
        sort: "average",
        termId: "term-1",
      },
    });
    render(element);

    expect(listReportSnapshotsForStudentMock).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({
        classGroupId: "group-1",
        search: "practice",
        sort: "average",
        termId: "term-1",
      }),
    );
    expect(screen.getByRole("heading", { name: /reports/i })).toBeDefined();
    expect(screen.getByLabelText(/term/i)).toBeDefined();
    expect(screen.getByLabelText(/class group/i)).toBeDefined();
    expect(screen.getByLabelText(/search/i)).toBeDefined();
    expect(screen.getByLabelText(/sort/i)).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/20 may 2026/i)).toBeDefined();
    expect(screen.getByText(/weighted term average:\s*92/i)).toBeDefined();
    expect(screen.getByText(/keep practicing/i)).toBeDefined();
    expect(screen.getByText(/pdf available/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view report/i })).toHaveAttribute(
      "href",
      "/portal/student/reports/snapshot-1",
    );
    expect(screen.queryByText(/foreign report/i)).toBeNull();
  });

  it("renders empty state", async () => {
    listReportSnapshotsForStudentMock.mockResolvedValueOnce([]);
    const page = await loadStudentReportsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no reports available yet/i)).toBeDefined();
  });

  it("renders filtered empty state", async () => {
    listReportSnapshotsForStudentMock.mockResolvedValueOnce([]);
    const page = await loadStudentReportsPage();
    const element = await page.default({ searchParams: { search: "missing" } });
    render(element);

    expect(screen.getByText(/no reports match the selected filters/i)).toBeDefined();
  });

  it("rejects wrong roles before loading reports", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadStudentReportsPage();

    await expect(page.default({ searchParams: {} })).rejects.toThrow("NEXT_REDIRECT");
    expect(listReportSnapshotsForStudentMock).not.toHaveBeenCalled();
  });
});
