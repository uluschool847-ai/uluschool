import { existsSync, readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listStudentAttendanceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/attendance-repository", () => ({
  listStudentAttendance: listStudentAttendanceMock,
}));

type StudentAttendancePageModule = {
  default: (props: {
    searchParams?:
      | Promise<{
          classGroupId?: string;
          from?: string;
          scheduledClassId?: string;
          search?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
          to?: string;
        }>
      | {
          classGroupId?: string;
          from?: string;
          scheduledClassId?: string;
          search?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
          to?: string;
        };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/attendance/page.tsx";

async function loadStudentAttendancePage() {
  const specifier = "@/app/portal/student/attendance/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentAttendancePageModule>;
}

function attendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "attendance-1",
    lateMinutes: 8,
    lesson: {
      detailHref: "/portal/student/schedule/lesson-1",
      endAt: new Date("2026-06-10T11:00:00.000Z"),
      id: "lesson-1",
      startAt: new Date("2026-06-10T10:00:00.000Z"),
      status: "COMPLETED",
      title: "Quadratic functions",
    },
    markedAt: new Date("2026-06-10T10:14:00.000Z"),
    reason: "Bus delay",
    status: "LATE",
    statusLabel: "Late",
    subject: { id: "subject-math", name: "Mathematics" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    teacher: { id: "teacher-1", name: "Jane Teacher" },
    ...overrides,
  };
}

function attendanceResult(overrides: Record<string, unknown> = {}) {
  return {
    records: [attendanceRecord()],
    summary: {
      absent: 1,
      attendanceRate: 67,
      late: 1,
      present: 1,
      total: 3,
    },
    ...overrides,
  };
}

describe("Student attendance page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      email: "student@example.com",
      role: UserRole.STUDENT,
      uid: "student-1",
    });
    listStudentAttendanceMock.mockResolvedValue(attendanceResult());
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the STUDENT guard, dedicated attendance repository, and no direct Prisma query", () => {
    expect(existsSync(PAGE_SOURCE_PATH), "student attendance page should exist").toBe(true);

    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("listStudentAttendance");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("requires STUDENT and forwards attendance filters using session.uid", async () => {
    const page = await loadStudentAttendancePage();
    const element = await page.default({
      searchParams: Promise.resolve({
        classGroupId: "group-1",
        from: "2026-06-01",
        scheduledClassId: "lesson-1",
        search: "quadratic",
        sort: "lessonDateAsc",
        status: "LATE",
        subjectId: "subject-math",
        to: "2026-06-30",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listStudentAttendanceMock).toHaveBeenCalledWith("student-1", {
      classGroupId: "group-1",
      from: "2026-06-01",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "lessonDateAsc",
      status: "LATE",
      subjectId: "subject-math",
      to: "2026-06-30",
    });
  });

  it("renders filters, summary counts, attendance records, and lesson detail links", async () => {
    const page = await loadStudentAttendancePage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /^attendance$/i })).toBeDefined();
    expect(screen.getByLabelText("Status")).toBeDefined();
    expect(screen.getByLabelText("Subject")).toBeDefined();
    expect(screen.getByLabelText("Class group")).toBeDefined();
    expect(screen.getByLabelText("Class / lesson")).toBeDefined();
    expect(screen.getByLabelText("From")).toBeDefined();
    expect(screen.getByLabelText("To")).toBeDefined();
    expect(screen.getByLabelText("Search")).toBeDefined();
    expect(screen.getByLabelText("Sort")).toBeDefined();

    expect(screen.getByText(/present\s*1/i)).toBeDefined();
    expect(screen.getByText(/late\s*1/i)).toBeDefined();
    expect(screen.getByText(/absent\s*1/i)).toBeDefined();
    expect(screen.getByText(/total\s*3/i)).toBeDefined();

    const row = screen.getByRole("article", { name: /quadratic functions/i });
    expect(within(row).getByText(/mathematics/i)).toBeDefined();
    expect(within(row).getByText(/igcse mathematics a/i)).toBeDefined();
    expect(within(row).getByText(/late/i)).toBeDefined();
    expect(within(row).getByText(/late minutes:\s*8/i)).toBeDefined();
    expect(within(row).getByText(/bus delay/i)).toBeDefined();
    expect(within(row).getByText(/marked/i)).toBeDefined();
    expect(within(row).getByRole("link", { name: /view lesson|lesson detail/i })).toHaveAttribute(
      "href",
      "/portal/student/schedule/lesson-1",
    );
    expect(screen.queryByText(/other student attendance/i)).toBeNull();
  });

  it("shows distinct empty states for unfiltered and filtered attendance lists", async () => {
    listStudentAttendanceMock.mockResolvedValueOnce(attendanceResult({ records: [] }));

    const page = await loadStudentAttendancePage();
    const unfiltered = await page.default({ searchParams: {} });
    const { unmount } = render(unfiltered);

    expect(screen.getByText("No attendance records yet.")).toBeDefined();
    unmount();

    listStudentAttendanceMock.mockResolvedValueOnce(attendanceResult({ records: [] }));
    const filtered = await page.default({ searchParams: { status: "ABSENT" } });
    render(filtered);

    expect(screen.getByText("No attendance records match the selected filters.")).toBeDefined();
  });

  it.each([UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading student attendance",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadStudentAttendancePage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
      expect(listStudentAttendanceMock).not.toHaveBeenCalled();
    },
  );
});
