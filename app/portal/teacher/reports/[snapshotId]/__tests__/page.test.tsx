import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getReportSnapshotForTeacherMock = vi.hoisted(() => vi.fn());
const listReportCommentDraftsForTeacherMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/report-repository", () => ({
  getReportSnapshotForTeacher: getReportSnapshotForTeacherMock,
}));
vi.mock("@/lib/repositories/ai-draft-repository", () => ({
  listReportCommentDraftsForTeacher: listReportCommentDraftsForTeacherMock,
}));
vi.mock("@/app/portal/teacher/actions/ai-draft-actions", () => ({
  generateReportCommentDraftAction: vi.fn(),
  reviewTeacherAiDraftAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

type SnapshotPageModule = {
  default: (props: {
    params: Promise<{ snapshotId: string }> | { snapshotId: string };
  }) => Promise<ReactElement> | ReactElement;
};

function loadSnapshotPage() {
  const specifier = "@/app/portal/teacher/reports/[snapshotId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<SnapshotPageModule>;
}

function savedSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date("2026-05-20T10:00:00.000Z"),
    generatedByTeacherId: "teacher-1",
    id: "snapshot-1",
    snapshotData: {
      attendance: { absent: 1, late: 1, present: 8 },
      classGroup: { id: "group-1", name: "Algebra Group A" },
      grades: { weightedTermAverage: 92 },
      progressNotes: [{ content: "Saved progress note" }],
      academicTerm: { id: "term-1", name: "Spring 2026" },
      student: { id: "student-1", fullName: "Amina Yusuf" },
      teacherComment: "Saved teacher comment",
    },
    snapshotVersion: 1,
    ...overrides,
  };
}

describe("Teacher saved report page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getReportSnapshotForTeacherMock.mockResolvedValue(savedSnapshot());
    listReportCommentDraftsForTeacherMock.mockResolvedValue([]);
  });

  afterEach(() => cleanup());

  it("uses TEACHER guard, saved snapshot repository, and no live-data query", () => {
    const source = readFileSync("app/portal/teacher/reports/[snapshotId]/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/report-repository");
    expect(source).toContain("@/lib/repositories/ai-draft-repository");
    expect(source).toContain("getReportSnapshotForTeacher(session.uid");
    expect(source).toContain("listReportCommentDraftsForTeacher(session.uid");
    expect(source).not.toContain("buildReportPreview");
    expect(source).not.toContain("getTeacherStudentGradebook");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("renders immutable saved snapshot data and PDF export action", async () => {
    const page = await loadSnapshotPage();
    const element = await page.default({ params: { snapshotId: "snapshot-1" } });
    render(element);

    expect(getReportSnapshotForTeacherMock).toHaveBeenCalledWith("teacher-1", "snapshot-1");
    expect(listReportCommentDraftsForTeacherMock).toHaveBeenCalledWith("teacher-1", "snapshot-1");
    expect(screen.getByRole("heading", { name: /saved report/i })).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByText(/weighted term average:\s*92/i)).toBeDefined();
    expect(screen.getByText(/saved teacher comment/i)).toBeDefined();
    expect(screen.getByText(/snapshot version:\s*1/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /export pdf/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /ai draft assistant/i })).toBeDefined();
  });

  it("returns notFound for foreign or missing snapshot", async () => {
    getReportSnapshotForTeacherMock.mockResolvedValueOnce(null);
    const page = await loadSnapshotPage();

    await expect(page.default({ params: { snapshotId: "foreign-snapshot" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("links current report keys through the private application route", async () => {
    const key = "private/teachers/teacher-1/reports/snapshot-1.pdf";
    getReportSnapshotForTeacherMock.mockResolvedValueOnce(savedSnapshot({ pdfStorageKey: key }));
    const page = await loadSnapshotPage();
    render(await page.default({ params: { snapshotId: "snapshot-1" } }));

    expect(screen.getByRole("link", { name: /download pdf report/i })).toHaveAttribute(
      "href",
      storageUrlForKey(key),
    );
  });
});
