import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getReportSnapshotForParentMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  getReportSnapshotForParent: getReportSnapshotForParentMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

type ParentReportPageModule = {
  default: (props: {
    params:
      | Promise<{ snapshotId: string; studentId: string }>
      | { snapshotId: string; studentId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/reports/[studentId]/[snapshotId]/page.tsx";

function loadParentReportPage() {
  const specifier = "@/app/portal/parent/reports/[studentId]/[snapshotId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentReportPageModule>;
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date("2026-05-20T10:00:00.000Z"),
    id: "snapshot-1",
    pdfStorageKey: "/uploads/reports/snapshot-1.pdf",
    snapshotData: {
      academicTerm: { id: "term-1", name: "Spring 2026" },
      attendance: { absent: 1, late: 1, present: 8 },
      attendanceHistory: [{ lessonTitle: "Algebra review", status: "PRESENT" }],
      categoryAverages: [
        { average: 92, label: "Homework", weight: 70 },
        { average: 88, label: "Manual", weight: 30 },
      ],
      classGroup: { id: "group-1", name: "Algebra Group A" },
      grades: {
        categories: [{ average: 92, label: "Homework", weight: 70 }],
        homeworkGrades: [
          { feedback: "Precise graphing.", score: 92, title: "Quadratics homework" },
        ],
        manualGrades: [
          { description: "Confident oral explanation.", score: 88, title: "Oral checkpoint" },
        ],
        weightedTermAverage: 92,
      },
      progressNotes: [{ content: "Strong progress in transformations.", performanceLevel: "GOOD" }],
      student: { fullName: "Amina Yusuf", id: "student-1" },
      teacherComment: "Keep practicing transformations.",
    },
    snapshotVersion: 1,
    ...overrides,
  };
}

describe("Parent child report snapshot page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    getReportSnapshotForParentMock.mockResolvedValue(snapshot());
  });

  afterEach(() => cleanup());

  it("uses PARENT guard, linked-child snapshot repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("getReportSnapshotForParent(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("reads a saved snapshot through the parent-scoped repository", async () => {
    const page = await loadParentReportPage();
    const element = await page.default({
      params: { snapshotId: "snapshot-1", studentId: "student-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getReportSnapshotForParentMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      "snapshot-1",
    );
  });

  it("returns notFound for foreign or unlinked snapshots", async () => {
    getReportSnapshotForParentMock.mockResolvedValueOnce(null);
    const page = await loadParentReportPage();

    await expect(
      page.default({ params: { snapshotId: "foreign-snapshot", studentId: "unlinked-student" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders immutable snapshot sections", async () => {
    const page = await loadParentReportPage();
    const element = await page.default({
      params: { snapshotId: "snapshot-1", studentId: "student-1" },
    });
    render(element);

    expect(screen.getByRole("heading", { name: /^report$/i })).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/20 May 2026/i)).toBeDefined();
    expect(screen.getByText(/weighted term average:\s*92/i)).toBeDefined();

    const grades = screen.getByRole("region", { name: /grades summary/i });
    expect(within(grades).getByText(/homework/i)).toBeDefined();
    expect(within(grades).getByText("Quadratics homework")).toBeDefined();
    expect(within(grades).getByText("Oral checkpoint")).toBeDefined();

    const attendance = screen.getByRole("region", { name: /attendance/i });
    expect(within(attendance).getByText(/present:\s*8/i)).toBeDefined();
    expect(within(attendance).getByText(/late:\s*1/i)).toBeDefined();
    expect(within(attendance).getByText(/absent:\s*1/i)).toBeDefined();
    expect(within(attendance).getByText(/algebra review/i)).toBeDefined();

    const progress = screen.getByRole("region", { name: /progress/i });
    expect(within(progress).getByText(/strong progress/i)).toBeDefined();
    expect(screen.getByText(/keep practicing transformations/i)).toBeDefined();
  });

  it("exposes only safe uploaded PDF links", async () => {
    const page = await loadParentReportPage();
    const element = await page.default({
      params: { snapshotId: "snapshot-1", studentId: "student-1" },
    });
    render(element);

    expect(screen.getByRole("link", { name: /download pdf|open pdf/i })).toHaveAttribute(
      "href",
      "/uploads/reports/snapshot-1.pdf",
    );

    cleanup();
    getReportSnapshotForParentMock.mockResolvedValueOnce(
      snapshot({ pdfStorageKey: "https://evil.test/report.pdf" }),
    );
    const unsafeElement = await page.default({
      params: { snapshotId: "snapshot-unsafe", studentId: "student-1" },
    });
    render(unsafeElement);

    expect(screen.queryByRole("link", { name: /download pdf|open pdf/i })).toBeNull();
    expect(screen.queryByText(/https:\/\/evil\.test/i)).toBeNull();
  });

  it("renders no export regenerate or delete controls", async () => {
    const page = await loadParentReportPage();
    const element = await page.default({
      params: { snapshotId: "snapshot-1", studentId: "student-1" },
    });
    render(element);

    for (const label of [/export/i, /regenerate/i, /delete/i, /save/i]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });
});
