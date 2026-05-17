import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getClassGroupByIdMock = vi.hoisted(() => vi.fn());
const listAvailableStudentsForClassGroupMock = vi.hoisted(() => vi.fn());
const listClassGroupLessonsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/class-group-repository", () => ({
  getClassGroupById: getClassGroupByIdMock,
  listAvailableStudentsForClassGroup: listAvailableStudentsForClassGroupMock,
  listClassGroupLessons: listClassGroupLessonsMock,
}));

type ClassGroupDetailPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadClassGroupDetailPage() {
  const specifier = "@/app/(admin)/admin/classes/[id]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGroupDetailPageModule>;
}

describe("Admin class group detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN and renders group profile, students, lessons, and create lesson affordance", async () => {
    getClassGroupByIdMock.mockResolvedValueOnce({
      id: "group-1",
      name: "IGCSE Mathematics Group A",
      description: "Core IGCSE mathematics group",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
      teacher: {
        id: "teacher-1",
        fullName: "John Smith",
        email: "john.smith@example.com",
        role: UserRole.TEACHER,
      },
      students: [
        { id: "student-1", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
        { id: "student-2", fullName: "Mark Shevchenko", email: "mark@example.com" },
      ],
      studentsCount: 2,
      capacity: 8,
      upcomingLessonsCount: 1,
      status: "ACTIVE",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-03T10:00:00.000Z"),
    });
    listAvailableStudentsForClassGroupMock.mockResolvedValueOnce([
      { id: "student-3", fullName: "Available Student", email: "available@example.com" },
    ]);
    listClassGroupLessonsMock.mockResolvedValueOnce([
      {
        id: "lesson-past",
        title: "Algebra foundations",
        startAt: new Date("2026-05-01T10:00:00.000Z"),
        endAt: new Date("2026-05-01T11:00:00.000Z"),
        liveLessonUrl: "https://meet.example.com/past",
      },
      {
        id: "lesson-upcoming",
        title: "Quadratic functions",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        liveLessonUrl: "https://meet.example.com/upcoming",
      },
    ]);

    const page = await loadClassGroupDetailPage();
    const element = await page.default({ params: { id: "group-1" } });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getClassGroupByIdMock).toHaveBeenCalledWith("group-1");
    expect(listAvailableStudentsForClassGroupMock).toHaveBeenCalledWith("group-1");
    expect(listClassGroupLessonsMock).toHaveBeenCalledWith("group-1");
    expect(screen.getByRole("heading", { name: /igcse mathematics group a/i })).toBeDefined();
    expect(screen.getByText(/^active$/i)).toBeDefined();
    expect(screen.getByText(/^mathematics$/i)).toBeDefined();
    expect(screen.getByText(/^igcse$/i)).toBeDefined();
    expect(screen.getByText(/john smith/i)).toBeDefined();
    expect(screen.getByText(/sofia shevchenko/i)).toBeDefined();
    expect(screen.getByText(/mark shevchenko/i)).toBeDefined();
    expect(screen.getByText(/available student/i)).toBeDefined();
    expect(screen.getByText(/quadratic functions/i)).toBeDefined();
    expect(screen.getByText(/algebra foundations/i)).toBeDefined();
    expect(screen.getByText(/https:\/\/meet\.example\.com\/upcoming/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /create lesson|new lesson/i })).toHaveProperty(
      "href",
      expect.stringContaining("/admin/classes/group-1/lessons/new"),
    );
  });
});
