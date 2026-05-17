import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listScheduleForUserMock = vi.hoisted(() => vi.fn());
const listLessonsForStudentMock = vi.hoisted(() => vi.fn());
const listLessonsForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/schedule-repository", () => ({
  listScheduleForUser: listScheduleForUserMock,
}));

vi.mock("@/lib/repositories/lesson-repository", () => ({
  listLessonsForStudent: listLessonsForStudentMock,
  listLessonsForTeacher: listLessonsForTeacherMock,
}));

import PortalSchedulePage from "@/app/portal/schedule/page";

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

describe("Portal schedule subject display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    listLessonsForTeacherMock.mockResolvedValue([]);
    listScheduleForUserMock.mockResolvedValue([]);
    listLessonsForStudentMock.mockResolvedValue([
      {
        id: "class-1",
        title: "IGCSE Mathematics - Group A",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        liveLessonUrl: "https://example.com/live/math",
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the linked subject name without changing student schedule visibility rules", async () => {
    await renderServerComponent(
      <PortalSchedulePage searchParams={Promise.resolve({ month: "2026-06" })} />,
    );

    expect(requireRoleMock).toHaveBeenCalledWith([
      UserRole.ADMIN,
      UserRole.TEACHER,
      UserRole.PARENT,
      UserRole.STUDENT,
    ]);
    expect(listLessonsForStudentMock).toHaveBeenCalledWith("student-1", {
      from: expect.any(Date),
      to: expect.any(Date),
    });
    expect(screen.getByText("IGCSE Mathematics - Group A")).toBeDefined();
    expect(screen.getByText(/^Subject: Mathematics$/i)).toBeDefined();
    expect(screen.getByText(/^Group: IGCSE Mathematics Group A$/i)).toBeDefined();
    expect(screen.getByText(/teacher: jane teacher/i)).toBeDefined();
    expect(screen.queryByText(/unrelated group lesson/i)).toBeNull();
  });

  it("renders parent schedule lessons returned for linked children", async () => {
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
    listScheduleForUserMock.mockResolvedValue([
      {
        id: "child-group-lesson",
        title: "Child group lesson",
        startAt: new Date("2026-06-03T10:00:00.000Z"),
        endAt: new Date("2026-06-03T11:00:00.000Z"),
        liveLessonUrl: "https://example.com/live/child-group",
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
      },
    ]);

    await renderServerComponent(
      <PortalSchedulePage searchParams={Promise.resolve({ month: "2026-06" })} />,
    );

    expect(listScheduleForUserMock).toHaveBeenCalledWith(
      "parent-1",
      UserRole.PARENT,
      expect.any(Date),
      expect.any(Date),
    );
    expect(screen.getByText("Child group lesson")).toBeDefined();
    expect(screen.getByText(/^Group: IGCSE Mathematics Group A$/i)).toBeDefined();
    expect(screen.queryByText(/unrelated group lesson/i)).toBeNull();
  });

  it("renders student lesson lifecycle state while keeping group and direct enrolment visibility", async () => {
    listLessonsForStudentMock.mockResolvedValue([
      {
        id: "group-lesson",
        title: "Group lesson",
        startAt: new Date("2026-06-03T10:00:00.000Z"),
        endAt: new Date("2026-06-03T11:00:00.000Z"),
        status: "SCHEDULED",
        liveLessonUrl: "https://example.com/live/group",
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
      },
      {
        id: "direct-lesson",
        title: "Direct enrolment lesson",
        startAt: new Date("2026-06-04T10:00:00.000Z"),
        endAt: new Date("2026-06-04T11:00:00.000Z"),
        status: "LIVE",
        liveLessonUrl: "https://example.com/live/direct",
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: null,
      },
      {
        id: "cancelled-lesson",
        title: "Cancelled lesson",
        startAt: new Date("2026-06-05T10:00:00.000Z"),
        endAt: new Date("2026-06-05T11:00:00.000Z"),
        status: "CANCELLED",
        cancelReason: "Teacher unavailable",
        liveLessonUrl: "https://example.com/live/cancelled",
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
      },
      {
        id: "completed-lesson",
        title: "Completed lesson",
        startAt: new Date("2026-06-06T10:00:00.000Z"),
        endAt: new Date("2026-06-06T11:00:00.000Z"),
        status: "COMPLETED",
        liveLessonUrl: "https://example.com/live/completed",
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
      },
    ]);

    await renderServerComponent(
      <PortalSchedulePage searchParams={Promise.resolve({ month: "2026-06" })} />,
    );

    expect(listLessonsForStudentMock).toHaveBeenCalledWith("student-1", {
      from: expect.any(Date),
      to: expect.any(Date),
    });
    expect(screen.getByText("Group lesson")).toBeDefined();
    expect(screen.getByText("Direct enrolment lesson")).toBeDefined();
    expect(screen.queryByText("Unrelated group lesson")).toBeNull();
    expect(screen.getAllByText(/^Subject: Mathematics$/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/teacher: jane teacher/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/scheduled/i)).toBeDefined();
    expect(screen.getByText(/live/i)).toBeDefined();
    expect(screen.getByText(/cancelled/i)).toBeDefined();
    expect(screen.getByText(/teacher unavailable/i)).toBeDefined();
    expect(screen.getByText(/completed/i)).toBeDefined();
    expect(screen.getAllByRole("link", { name: /join/i })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /join.*cancelled/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /join.*completed/i })).toBeNull();
  });

  it("applies the selected month and renders the empty schedule state", async () => {
    listLessonsForStudentMock.mockResolvedValue([]);

    await renderServerComponent(
      <PortalSchedulePage searchParams={Promise.resolve({ month: "2026-07" })} />,
    );

    const [, range] = listLessonsForStudentMock.mock.calls.at(-1) ?? [];
    const { from: start, to: end } = range ?? {};
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect((start as Date).getMonth()).toBe(6);
    expect((end as Date).getMonth()).toBe(7);
    expect(screen.getByLabelText(/month/i)).toHaveProperty("value", "2026-07");
    expect(screen.getByText(/no lessons scheduled|no classes scheduled/i)).toBeDefined();
  });
});
