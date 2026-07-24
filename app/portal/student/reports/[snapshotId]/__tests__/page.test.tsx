import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getReportSnapshotForStudentMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  getReportSnapshotForStudent: getReportSnapshotForStudentMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

type StudentReportPageModule = {
  default: (props: {
    params: Promise<{ snapshotId: string }> | { snapshotId: string };
  }) => Promise<ReactElement> | ReactElement;
};

function loadStudentReportPage() {
  const specifier = "@/app/portal/student/reports/[snapshotId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentReportPageModule>;
}

describe("Student report snapshot page", () => {
  const reportKey = "private/teachers/teacher-1/reports/snapshot-1.pdf";
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    getReportSnapshotForStudentMock.mockResolvedValue({
      generatedAt: new Date("2026-05-20T10:00:00.000Z"),
      id: "snapshot-1",
      pdfGeneratedAt: new Date("2026-05-21T10:00:00.000Z"),
      pdfStorageKey: reportKey,
      snapshotData: {
        academicTerm: { id: "term-1", name: "Spring 2026" },
        attendance: { absent: 1, late: 1, present: 8 },
        attendanceHistory: [{ lessonTitle: "Algebra review", status: "PRESENT" }],
        classGroup: { id: "group-1", name: "Algebra Group A" },
        grades: {
          categories: [
            { category: "HOMEWORK", label: "Homework", average: 92 },
            { category: "MANUAL", label: "Manual", average: 88 },
          ],
          homeworkGrades: [
            {
              score: 92,
              subject: { name: "Algebra" },
              title: "Quadratics homework",
            },
          ],
          manualGrades: [
            {
              description: "Strong oral reasoning",
              score: 88,
              subject: { name: "Algebra" },
              title: "Oral checkpoint",
            },
          ],
          weightedTermAverage: 92,
        },
        progressNotes: [{ content: "Strong progress", performanceLevel: "GOOD" }],
        student: { fullName: "Amina Yusuf" },
        teacherComment: "Keep practicing",
      },
      snapshotVersion: 1,
    });
  });

  afterEach(() => cleanup());

  it("uses STUDENT guard, saved snapshot repository, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/student/reports/[snapshotId]/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("getReportSnapshotForStudent(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders own saved report detail with immutable snapshot sections and PDF link", async () => {
    const page = await loadStudentReportPage();
    const element = await page.default({ params: { snapshotId: "snapshot-1" } });
    render(element);

    expect(getReportSnapshotForStudentMock).toHaveBeenCalledWith("student-1", "snapshot-1");
    expect(screen.getByRole("heading", { name: /report/i })).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/20 may 2026/i)).toBeDefined();
    expect(screen.getByText(/weighted term average:\s*92/i)).toBeDefined();
    expect(screen.getByText(/homework/i)).toBeDefined();
    expect(screen.getByText(/manual/i)).toBeDefined();
    expect(screen.getByText(/quadratics homework/i)).toBeDefined();
    expect(screen.getByText(/oral checkpoint/i)).toBeDefined();
    expect(screen.getByText(/present:\s*8/i)).toBeDefined();
    expect(screen.getByText(/late:\s*1/i)).toBeDefined();
    expect(screen.getByText(/absent:\s*1/i)).toBeDefined();
    expect(screen.getByText(/algebra review/i)).toBeDefined();
    expect(screen.getByText(/strong progress/i)).toBeDefined();
    expect(screen.getByText(/keep practicing/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /download pdf|open pdf/i })).toHaveAttribute(
      "href",
      storageUrlForKey(reportKey),
    );
    expect(screen.getByRole("link", { name: /back to reports/i })).toHaveAttribute(
      "href",
      "/portal/student/reports",
    );
    expect(screen.queryByRole("button", { name: /save report snapshot/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export pdf/i })).toBeNull();
    expect(screen.queryByText(/c:\\|file:\/\//i)).toBeNull();
  });

  it("renders PDF unavailable state when no PDF metadata exists", async () => {
    getReportSnapshotForStudentMock.mockResolvedValueOnce({
      generatedAt: new Date("2026-05-20T10:00:00.000Z"),
      id: "snapshot-1",
      pdfStorageKey: null,
      snapshotData: {
        academicTerm: { name: "Spring 2026" },
        grades: { weightedTermAverage: 92 },
        student: { fullName: "Amina Yusuf" },
      },
    });
    const page = await loadStudentReportPage();
    const element = await page.default({ params: { snapshotId: "snapshot-1" } });
    render(element);

    expect(screen.getByText(/pdf is not available yet/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /download pdf|open pdf/i })).toBeNull();
  });

  it.each([
    ["canonical", storageUrlForKey(reportKey), storageUrlForKey(reportKey)],
    ["legacy", "/uploads/reports/snapshot-1.pdf", "/uploads/reports/snapshot-1.pdf"],
    [
      "external",
      "https://reports.example.com/snapshot%201.pdf?download=1",
      "https://reports.example.com/snapshot%201.pdf?download=1",
    ],
  ])("preserves safe %s PDF values", async (_label, value, expected) => {
    getReportSnapshotForStudentMock.mockResolvedValueOnce({
      ...(await getReportSnapshotForStudentMock()),
      pdfStorageKey: value,
    });
    const page = await loadStudentReportPage();
    render(await page.default({ params: { snapshotId: "snapshot-1" } }));

    expect(screen.getByRole("link", { name: /download pdf|open pdf/i })).toHaveAttribute(
      "href",
      expected,
    );
  });

  it("returns notFound for another student's snapshot", async () => {
    getReportSnapshotForStudentMock.mockResolvedValueOnce(null);
    const page = await loadStudentReportPage();

    await expect(page.default({ params: { snapshotId: "foreign-snapshot" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
