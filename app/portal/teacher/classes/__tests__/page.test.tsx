import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherClassGroupsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-classes-repository", () => ({
  listTeacherClassGroups: listTeacherClassGroupsMock,
}));

type TeacherClassesPageModule = {
  default: (props: {
    searchParams?:
      | Promise<{
          levelId?: string;
          q?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
        }>
      | {
          levelId?: string;
          q?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
        };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/classes/page.tsx";

async function loadTeacherClassesPage() {
  const specifier = "@/app/portal/teacher/classes/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherClassesPageModule>;
}

function classListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "IGCSE Geometry Group A",
    status: "ACTIVE",
    capacity: 12,
    subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
    level: { id: "level-igcse", name: "IGCSE" },
    rosterCount: 6,
    activeRosterCount: 5,
    nextLesson: {
      id: "lesson-next",
      title: "Nearest valid lesson",
      startAt: new Date("2026-06-05T09:00:00.000Z"),
      endAt: new Date("2026-06-05T10:00:00.000Z"),
      status: "SCHEDULED",
    },
    upcomingLessonsCount: 2,
    activeAssignmentsCount: 1,
    pendingSubmissionsCount: 1,
    openHref: "/portal/teacher/classes/group-1",
    scheduleHref: "/portal/teacher/schedule?classGroupId=group-1",
    nextLessonHref: "/portal/teacher/lessons/lesson-next",
    ...overrides,
  };
}

describe("Teacher classes index page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listTeacherClassGroupsMock.mockResolvedValue([classListItem()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the enum-based TEACHER guard and teacher classes repository", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/teacher-classes-repository");
    expect(source).not.toContain('requireRole(["TEACHER"])');
    expect(source).not.toContain("requireRole(['TEACHER'])");
  });

  it("requires TEACHER and forwards query params to listTeacherClassGroups", async () => {
    const page = await loadTeacherClassesPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        levelId: "level-igcse",
        q: "geometry",
        sort: "pendingSubmissions",
        status: "ACTIVE",
        subjectId: "subject-geometry",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherClassGroupsMock).toHaveBeenCalledWith("teacher-1", {
      levelId: "level-igcse",
      q: "geometry",
      sort: "pendingSubmissions",
      status: "ACTIVE",
      subjectId: "subject-geometry",
    });
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading classes",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadTeacherClassesPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(listTeacherClassGroupsMock).not.toHaveBeenCalled();
    },
  );

  it("renders search, filter, sort controls, class rows, and teacher-only links", async () => {
    const page = await loadTeacherClassesPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /my classes/i })).toBeDefined();
    expect(screen.getByLabelText(/search classes/i)).toHaveAttribute("name", "q");
    expect(screen.getByLabelText(/status/i)).toHaveAttribute("name", "status");
    expect(screen.getByLabelText(/subject/i)).toHaveAttribute("name", "subjectId");
    expect(screen.getByLabelText(/level/i)).toHaveAttribute("name", "levelId");
    expect(screen.getByLabelText(/sort/i)).toHaveAttribute("name", "sort");

    expect(screen.getByText("IGCSE Geometry Group A")).toBeDefined();
    expect(screen.getByText(/subject:\s*geometry/i)).toBeDefined();
    expect(screen.getByText(/level:\s*igcse/i)).toBeDefined();
    expect(screen.getByText(/status:\s*active/i)).toBeDefined();
    expect(screen.getByText(/capacity:\s*12/i)).toBeDefined();
    expect(screen.getByText(/5 active \/ 6 total/i)).toBeDefined();
    expect(screen.getByText(/upcoming lessons:\s*2/i)).toBeDefined();
    expect(screen.getByText(/active assignments:\s*1/i)).toBeDefined();
    expect(screen.getByText(/pending submissions:\s*1/i)).toBeDefined();
    expect(screen.getByText(/nearest valid lesson/i)).toBeDefined();

    expect(
      screen.getByRole("link", { name: /view class.*igcse geometry group a/i }),
    ).toHaveAttribute("href", "/portal/teacher/classes/group-1");
    expect(screen.getByRole("link", { name: /schedule.*igcse geometry group a/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?classGroupId=group-1",
    );
    expect(
      screen.getByRole("link", { name: /open lesson.*nearest valid lesson/i }),
    ).toHaveAttribute("href", "/portal/teacher/lessons/lesson-next");

    expect(screen.queryByRole("link", { name: /create class/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete class/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /enrol student/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /change teacher/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /edit student profile/i })).toBeNull();
  });

  it("renders an explicit empty state when the teacher has no classes", async () => {
    listTeacherClassGroupsMock.mockResolvedValueOnce([]);

    const page = await loadTeacherClassesPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no classes assigned/i)).toBeDefined();
  });
});
