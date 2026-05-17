import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAdminLessonsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/lesson-repository", () => ({
  listAdminLessons: listAdminLessonsMock,
}));

type LessonsListPageModule = {
  default: (props: {
    params: Promise<{ classGroupId: string }> | { classGroupId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadLessonsListPage() {
  const specifier = "@/app/(admin)/admin/classes/[classGroupId]/lessons/page";
  return import(/* @vite-ignore */ specifier) as Promise<LessonsListPageModule>;
}

describe("Admin scheduled lessons list page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN, forwards filters, and renders lesson/session rows", async () => {
    const from = "2026-06-01";
    const to = "2026-06-30";
    listAdminLessonsMock.mockResolvedValueOnce([
      {
        id: "lesson-1",
        title: "Quadratic functions",
        classGroupId: "group-1",
        classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        status: "SCHEDULED",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        remindersCount: 2,
      },
      {
        id: "lesson-2",
        title: "Cancelled revision",
        classGroupId: "group-1",
        classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
        teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        startAt: new Date("2026-06-03T10:00:00.000Z"),
        endAt: new Date("2026-06-03T11:00:00.000Z"),
        status: "CANCELLED",
        liveLessonUrl: "https://meet.google.com/cancelled",
        remindersCount: 0,
      },
    ]);

    const page = await loadLessonsListPage();
    const element = await page.default({
      params: { classGroupId: "group-1" },
      searchParams: {
        teacherId: "teacher-1",
        classGroupId: "group-1",
        subjectId: "subject-math",
        status: "SCHEDULED",
        from,
        to,
      },
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(listAdminLessonsMock).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      classGroupId: "group-1",
      subjectId: "subject-math",
      status: "SCHEDULED",
      from: new Date(`${from}T00:00:00`),
      to: new Date(`${to}T23:59:59.999`),
    });
    expect(screen.getByRole("heading", { name: /lessons|sessions/i })).toBeDefined();
    expect(screen.getByText("Quadratic functions")).toBeDefined();
    expect(screen.getByText("IGCSE Mathematics Group A")).toBeDefined();
    expect(screen.getByText("Jane Teacher")).toBeDefined();
    expect(screen.getByText("Mathematics")).toBeDefined();
    expect(screen.getByText(/scheduled/i)).toBeDefined();
    expect(screen.getByText(/cancelled/i)).toBeDefined();
    expect(screen.getByText("https://meet.google.com/abc-defg-hij")).toBeDefined();
    expect(screen.getByText(/2 reminders/i)).toBeDefined();
    expect(screen.getByLabelText(/teacher/i)).toBeDefined();
    expect(screen.getByLabelText(/class group/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/from/i)).toBeDefined();
    expect(screen.getByLabelText(/to/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /create lesson|new lesson/i })).toHaveProperty(
      "href",
      expect.stringContaining("/admin/classes/group-1/lessons/new"),
    );
  });
});
