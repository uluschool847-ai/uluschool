import { readFileSync } from "node:fs";
import { AttendanceStatus, UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAttendanceForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/parent-attendance-repository", () => ({
  listAttendanceForParentChild: listAttendanceForParentChildMock,
}));

type ParentAttendancePageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/attendance/[studentId]/page.tsx";

function loadPage() {
  const specifier = "@/app/portal/parent/attendance/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentAttendancePageModule>;
}

function attendanceResult(overrides: Record<string, unknown> = {}) {
  return {
    records: [
      {
        classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
        id: "attendance-1",
        lateMinutes: 11,
        lesson: {
          detailHref: "/portal/parent/schedule/student-1/lesson-1",
          id: "lesson-1",
          startAt: new Date("2026-06-10T10:00:00.000Z"),
          title: "Quadratic functions",
        },
        markedAt: new Date("2026-06-10T10:15:00.000Z"),
        reason: "Bus delay",
        status: AttendanceStatus.LATE,
        statusLabel: "Late",
        subject: { id: "subject-math", name: "Mathematics" },
      },
    ],
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

describe("Parent child attendance page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    listAttendanceForParentChildMock.mockResolvedValue(attendanceResult());
  });

  afterEach(() => cleanup());

  it("uses the PARENT guard, dedicated parent attendance repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-attendance-repository");
    expect(source).toContain("listAttendanceForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("markAttendanceAction");
    expect(source).not.toContain("updateAttendanceAction");
    expect(source).not.toContain("markLessonAttendanceForTeacher");
  });

  it("renders back navigation and all parent attendance filters", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByRole("link", { name: /back to parent dashboard/i })).toHaveAttribute(
      "href",
      "/portal/parent",
    );
    expect(screen.getByLabelText("Status")).toBeDefined();
    expect(screen.getByLabelText("Subject")).toBeDefined();
    expect(screen.getByLabelText("Class group")).toBeDefined();
    expect(screen.getByLabelText("Class / lesson")).toBeDefined();
    expect(screen.getByLabelText("Date from")).toBeDefined();
    expect(screen.getByLabelText("Date to")).toBeDefined();
    expect(screen.getByLabelText("Search")).toBeDefined();
    expect(screen.getByLabelText("Sort")).toBeDefined();
  });

  it("lists attendance for the linked child using session.uid and route studentId", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: {
        classGroupId: "group-1",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-30",
        scheduledClassId: "lesson-1",
        search: "quadratic",
        sort: "lessonDateAsc",
        status: "LATE",
        subjectId: "subject-math",
      },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(listAttendanceForParentChildMock).toHaveBeenCalledWith("parent-1", "student-1", {
      classGroupId: "group-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "lessonDateAsc",
      status: "LATE",
      subjectId: "subject-math",
    });

    expect(screen.getByRole("heading", { name: /^attendance$/i })).toBeDefined();
    expect(screen.getByText(/attendance rate\s*67%/i)).toBeDefined();
    const row = screen.getByRole("article", { name: /quadratic functions/i });
    expect(within(row).getByText(/mathematics/i)).toBeDefined();
    expect(within(row).getByText(/late minutes:\s*11/i)).toBeDefined();
    expect(within(row).getByText(/bus delay/i)).toBeDefined();
    expect(within(row).getByRole("link", { name: /view lesson|lesson detail/i })).toHaveAttribute(
      "href",
      "/portal/parent/schedule/student-1/lesson-1",
    );
  });

  it("renders an empty state for unlinked or attendance-free children without foreign leakage", async () => {
    listAttendanceForParentChildMock.mockResolvedValueOnce(
      attendanceResult({
        records: [],
        summary: { absent: 0, attendanceRate: null, late: 0, present: 0, total: 0 },
      }),
    );
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "unlinked-student" } });
    render(element);

    expect(screen.getByText(/no attendance records/i)).toBeDefined();
    expect(screen.queryByText(/foreign attendance/i)).toBeNull();
  });

  it("renders the parent attendance view as read-only", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.queryByRole("button", { name: /mark|update|delete|save/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /mark|update|delete/i })).toBeNull();
    expect(screen.queryByLabelText(/attendance status|late minutes|reason/i)).toBeNull();
  });

  it("rejects non-parent roles before loading attendance data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadPage();

    await expect(page.default({ params: { studentId: "student-1" } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(listAttendanceForParentChildMock).not.toHaveBeenCalled();
  });
});
