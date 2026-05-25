import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherClassGroupDetailMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-classes-repository", () => ({
  getTeacherClassGroupDetail: getTeacherClassGroupDetailMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type TeacherClassGroupPageModule = {
  default: (props: {
    params: Promise<{ classGroupId: string }> | { classGroupId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/classes/[classGroupId]/page.tsx";

async function loadTeacherClassGroupPage() {
  const specifier = "@/app/portal/teacher/classes/[classGroupId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherClassGroupPageModule>;
}

function expectEnumTeacherGuardSource() {
  const source = readFileSync(PAGE_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).toContain("@/lib/repositories/teacher-classes-repository");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function classGroupDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "IGCSE Geometry Group A",
    status: "ACTIVE",
    capacity: 12,
    subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
    level: { id: "level-igcse", name: "IGCSE" },
    roster: [
      {
        id: "student-1",
        fullName: "Active Student",
        email: "active@example.com",
        isActive: true,
        learningStatus: "ACTIVE",
      },
      {
        id: "student-2",
        fullName: "Inactive Student",
        email: "inactive@example.com",
        isActive: false,
        learningStatus: "PAUSED",
      },
    ],
    upcomingLessons: [
      {
        id: "lesson-upcoming",
        title: "Upcoming geometry",
        startAt: new Date("2026-06-05T09:00:00.000Z"),
        endAt: new Date("2026-06-05T10:00:00.000Z"),
        status: "SCHEDULED",
        detailHref: "/portal/teacher/lessons/lesson-upcoming",
        startHref: "https://meet.example/upcoming",
      },
    ],
    pastLessons: [
      {
        id: "lesson-past",
        title: "Past algebra",
        startAt: new Date("2026-05-20T09:00:00.000Z"),
        endAt: new Date("2026-05-20T10:00:00.000Z"),
        status: "COMPLETED",
        detailHref: "/portal/teacher/lessons/lesson-past",
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Geometry homework",
        dueDate: new Date("2026-06-08T20:00:00.000Z"),
        submissionsCount: 2,
        pendingSubmissionsCount: 1,
      },
    ],
    materials: [
      {
        id: "material-1",
        title: "Angles worksheet",
        fileUrl: "/uploads/angles.pdf",
        fileHref: "/uploads/angles.pdf",
      },
    ],
    pendingSubmissions: [
      {
        id: "submission-1",
        student: { id: "student-1", fullName: "Active Student", email: "active@example.com" },
        assignment: { id: "assignment-1", title: "Geometry homework" },
        submittedAt: new Date("2026-06-06T10:00:00.000Z"),
        reviewHref: "/portal/teacher/submissions/submission-1",
      },
    ],
    ...overrides,
  };
}

describe("Teacher class/group detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the enum-based server-side TEACHER page guard", () => {
    expectEnumTeacherGuardSource();
  });

  it("requires TEACHER and loads the class group detail with session uid and classGroupId", async () => {
    getTeacherClassGroupDetailMock.mockResolvedValueOnce(classGroupDetail());

    const page = await loadTeacherClassGroupPage();
    const element = await page.default({ params: { classGroupId: "group-1" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherClassGroupDetailMock).toHaveBeenCalledWith("teacher-1", "group-1");
    expect(screen.getByRole("heading", { name: /igcse geometry group a/i })).toBeDefined();
  });

  it("returns notFound for another teacher's class group", async () => {
    getTeacherClassGroupDetailMock.mockResolvedValueOnce(null);

    const page = await loadTeacherClassGroupPage();

    await expect(page.default({ params: { classGroupId: "other-teacher-group" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherClassGroupDetailMock).toHaveBeenCalledWith("teacher-1", "other-teacher-group");
    expect(notFound).toHaveBeenCalled();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions at the class detail page guard",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherClassGroupPage();

      await expect(page.default({ params: { classGroupId: "group-1" } })).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(getTeacherClassGroupDetailMock).not.toHaveBeenCalled();
    },
  );

  it("renders class metadata, roster status, learning work, and teacher lesson links", async () => {
    getTeacherClassGroupDetailMock.mockResolvedValueOnce(classGroupDetail());

    const page = await loadTeacherClassGroupPage();
    const element = await page.default({ params: Promise.resolve({ classGroupId: "group-1" }) });
    render(element);

    expect(screen.getByText(/subject:\s*geometry/i)).toBeDefined();
    expect(screen.getByText(/level:\s*igcse/i)).toBeDefined();
    expect(screen.getByText(/status:\s*active/i)).toBeDefined();
    expect(screen.getByText(/capacity:\s*12/i)).toBeDefined();

    expect(screen.getByRole("heading", { name: /roster/i })).toBeDefined();
    expect(screen.getByText(/^Active Student$/)).toBeDefined();
    expect(screen.getByText(/learning status:\s*active/i)).toBeDefined();
    const inactiveRow = screen.getByText(/inactive student/i).closest("li");
    expect(inactiveRow?.textContent ?? "").toMatch(/inactive/i);
    expect(inactiveRow?.textContent ?? "").toMatch(/paused/i);

    expect(screen.getByRole("heading", { name: /upcoming lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /past lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /assignments/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /materials/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /pending submissions/i })).toBeDefined();

    expect(screen.getByText("Upcoming geometry")).toBeDefined();
    expect(screen.getByText("Past algebra")).toBeDefined();
    expect(screen.getByText("Geometry homework")).toBeDefined();
    expect(screen.getByText("Angles worksheet")).toBeDefined();
    expect(screen.getByRole("link", { name: /open material.*angles worksheet/i })).toHaveAttribute(
      "href",
      "/uploads/angles.pdf",
    );
    expect(screen.getByText(/1 pending/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /start lesson.*upcoming geometry/i })).toHaveAttribute(
      "href",
      "https://meet.example/upcoming",
    );
    expect(screen.getByRole("link", { name: /open details.*upcoming geometry/i })).toHaveAttribute(
      "href",
      "/portal/teacher/lessons/lesson-upcoming",
    );
    expect(screen.getByRole("link", { name: /open details.*past algebra/i })).toHaveAttribute(
      "href",
      "/portal/teacher/lessons/lesson-past",
    );
    expect(screen.getByRole("link", { name: /back to classes/i })).toHaveAttribute(
      "href",
      "/portal/teacher/classes",
    );
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?classGroupId=group-1",
    );
    expect(screen.getByRole("link", { name: /assignments|homework/i })).toHaveAttribute(
      "href",
      "/portal/teacher/assignments?classGroupId=group-1",
    );
    expect(screen.queryByRole("link", { name: /create class/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete class/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /enrol student/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /change teacher/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /edit student profile/i })).toBeNull();
  });

  it("handles empty roster, lessons, assignments, materials, and submissions safely", async () => {
    getTeacherClassGroupDetailMock.mockResolvedValueOnce(
      classGroupDetail({
        roster: [],
        upcomingLessons: [],
        pastLessons: [],
        assignments: [],
        materials: [],
        pendingSubmissions: [],
      }),
    );

    const page = await loadTeacherClassGroupPage();
    const element = await page.default({ params: { classGroupId: "group-1" } });
    render(element);

    expect(screen.getByText(/no students enrolled/i)).toBeDefined();
    expect(screen.getByText(/no upcoming lessons/i)).toBeDefined();
    expect(screen.getByText(/no past lessons/i)).toBeDefined();
    expect(screen.getByText(/no assignments/i)).toBeDefined();
    expect(screen.getByText(/no materials/i)).toBeDefined();
    expect(screen.getByText(/no pending submissions/i)).toBeDefined();
  });
});
