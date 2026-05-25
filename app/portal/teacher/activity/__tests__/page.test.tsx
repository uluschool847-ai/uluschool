import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherActivityLogMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/teacher-activity-log-repository", () => ({
  listTeacherActivityLog: listTeacherActivityLogMock,
}));

type TeacherActivityPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadTeacherActivityPage() {
  const specifier = "@/app/portal/teacher/activity/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherActivityPageModule>;
}

describe("Teacher activity log page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listTeacherActivityLogMock.mockResolvedValue([
      {
        id: "activity-1",
        action: "ATTENDANCE_UPDATED",
        label: "Attendance updated",
        studentName: "Amina Yusuf",
        classGroupName: "Algebra Group A",
        lessonTitle: "Quadratics",
        summary: "Changed attendance from Late to Present",
        reason: "Correction after lesson",
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
        before: { status: "LATE", secret: "raw-before-secret" },
        after: { status: "PRESENT", secret: "raw-after-secret" },
        meta: { adminOnly: "raw-meta-secret" },
      },
    ]);
  });

  afterEach(() => cleanup());

  it("uses TEACHER guard, repository-driven data, and no direct Prisma query", () => {
    const source = readFileSync("app/portal/teacher/activity/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/teacher-activity-log-repository");
    expect(source).toContain("listTeacherActivityLog(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("forwards filters to listTeacherActivityLog using session.uid only", async () => {
    const page = await loadTeacherActivityPage();
    const element = await page.default({
      searchParams: {
        action: "ATTENDANCE_UPDATED",
        classGroupId: "group-1",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-31",
        studentId: "student-1",
        teacherId: "spoofed-teacher",
      },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherActivityLogMock).toHaveBeenCalledWith("teacher-1", {
      action: "ATTENDANCE_UPDATED",
      classGroupId: "group-1",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      studentId: "student-1",
    });
  });

  it("renders safe activity metadata without exposing raw before/after/meta JSON", async () => {
    const page = await loadTeacherActivityPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /activity log/i })).toBeDefined();
    expect(screen.getByText(/attendance updated/i)).toBeDefined();
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/quadratics/i)).toBeDefined();
    expect(screen.getByText(/changed attendance from late to present/i)).toBeDefined();
    expect(screen.getByText(/correction after lesson/i)).toBeDefined();
    expect(screen.queryByText(/raw-before-secret/i)).toBeNull();
    expect(screen.queryByText(/raw-after-secret/i)).toBeNull();
    expect(screen.queryByText(/raw-meta-secret/i)).toBeNull();
    expect(document.body.textContent).not.toContain('"before"');
    expect(document.body.textContent).not.toContain('"meta"');
  });

  it("renders activity filters and filtered empty state", async () => {
    listTeacherActivityLogMock.mockResolvedValueOnce([]);
    const page = await loadTeacherActivityPage();
    const element = await page.default({ searchParams: { action: "MANUAL_GRADE_ARCHIVED" } });
    render(element);

    expect(screen.getByLabelText(/action type/i)).toBeDefined();
    expect(screen.getByLabelText(/student/i)).toBeDefined();
    expect(screen.getByLabelText(/class\/group/i)).toBeDefined();
    expect(screen.getByLabelText(/date from/i)).toBeDefined();
    expect(screen.getByLabelText(/date to/i)).toBeDefined();
    expect(screen.getByText(/no activity matches the selected filters/i)).toBeDefined();
  });

  it("renders default empty state when there is no activity", async () => {
    listTeacherActivityLogMock.mockResolvedValueOnce([]);
    const page = await loadTeacherActivityPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no activity yet/i)).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadTeacherActivityPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listTeacherActivityLogMock).not.toHaveBeenCalled();
    },
  );
});
