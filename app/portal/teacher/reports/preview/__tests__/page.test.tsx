import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const buildReportPreviewMock = vi.hoisted(() => vi.fn());
const getTeacherReportOptionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  buildReportPreview: buildReportPreviewMock,
  getTeacherReportOptions: getTeacherReportOptionsMock,
}));

type PreviewPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadPreviewPage() {
  const specifier = "@/app/portal/teacher/reports/preview/page";
  return import(/* @vite-ignore */ specifier) as Promise<PreviewPageModule>;
}

function previewData() {
  return {
    attendance: { absent: 1, late: 1, present: 8 },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    generatedAt: new Date("2026-05-20T10:00:00.000Z"),
    generatedByTeacherId: "teacher-1",
    grades: {
      categories: [{ label: "Homework", average: 92 }],
      weightedTermAverage: 92,
    },
    progressNotes: [{ id: "progress-1", content: "Strong independent progress" }],
    academicTerm: { id: "term-1", name: "Spring 2026" },
    snapshotVersion: 1,
    student: { id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" },
  };
}

describe("Teacher report preview page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    buildReportPreviewMock.mockResolvedValue(previewData());
    getTeacherReportOptionsMock.mockResolvedValue({
      classGroups: [{ id: "group-1", name: "Algebra Group A", students: [] }],
      students: [{ id: "student-1", fullName: "Amina Yusuf", email: "amina@example.com" }],
      terms: [{ id: "term-1", name: "Spring 2026" }],
    });
  });

  afterEach(() => cleanup());

  it("uses TEACHER guard, live preview repository, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/teacher/reports/preview/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("buildReportPreview(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders preview from live gradebook, attendance, and progress data", async () => {
    const page = await loadPreviewPage();
    const element = await page.default({
      searchParams: { studentId: "student-1", termId: "term-1" },
    });
    render(element);

    expect(buildReportPreviewMock).toHaveBeenCalledWith("teacher-1", "student-1", "term-1");
    expect(screen.getByRole("heading", { name: /report preview/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /preview report/i })).toBeDefined();
    expect(screen.getAllByText(/amina yusuf/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getAllByText(/spring 2026/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/weighted term average:\s*92/i)).toBeDefined();
    expect(screen.getByText(/present:\s*8/i)).toBeDefined();
    expect(screen.getByText(/late:\s*1/i)).toBeDefined();
    expect(screen.getByText(/absent:\s*1/i)).toBeDefined();
    expect(screen.getByText(/strong independent progress/i)).toBeDefined();
    expect(screen.getByLabelText(/teacher comment/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /save report snapshot/i })).toBeDefined();
  });

  it("renders unavailable preview state for foreign or invalid student scope", async () => {
    buildReportPreviewMock.mockResolvedValueOnce(null);
    const page = await loadPreviewPage();
    const element = await page.default({
      searchParams: { studentId: "foreign-student", termId: "term-1" },
    });
    render(element);

    expect(screen.getByText(/report preview is not available/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /save report snapshot/i })).toBeNull();
  });
});
