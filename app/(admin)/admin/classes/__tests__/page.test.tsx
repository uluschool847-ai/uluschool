import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAdminClassGroupsMock = vi.hoisted(() => vi.fn());
const listAdminScheduledClassesMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("Admin classes page must list ClassGroups, not ScheduledClass lessons.");
  }),
);
const SERVER_COMPONENT_TEST_TIMEOUT_MS = 15_000;

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/class-group-repository", () => ({
  listAdminClassGroups: listAdminClassGroupsMock,
}));

vi.mock("@/lib/repositories/schedule-repository", () => ({
  listAdminScheduledClasses: listAdminScheduledClassesMock,
}));

type ClassesAdminPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadClassesAdminPage() {
  const specifier = "@/app/(admin)/admin/classes/page";
  return import(/* @vite-ignore */ specifier) as Promise<ClassesAdminPageModule>;
}

describe("Admin class groups page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "requires ADMIN and renders ClassGroup rows rather than single lessons",
    async () => {
      listAdminClassGroupsMock.mockResolvedValueOnce([
        {
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
          studentsCount: 6,
          capacity: 8,
          upcomingLessonsCount: 3,
          status: "ACTIVE",
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          updatedAt: new Date("2026-05-03T10:00:00.000Z"),
        },
      ]);

      const page = await loadClassesAdminPage();
      const element = await page.default();

      render(element);

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(listAdminClassGroupsMock).toHaveBeenCalledWith(expect.objectContaining({}));
      expect(listAdminScheduledClassesMock).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: /classes|groups/i })).toBeDefined();
      expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
      expect(screen.getByText(/^mathematics$/i)).toBeDefined();
      expect(screen.getByText(/^igcse$/i)).toBeDefined();
      expect(screen.getByText(/john smith/i)).toBeDefined();
      expect(screen.getByText(/6\s*\/\s*8|6 students|students:\s*6/i)).toBeDefined();
      expect(screen.getByText(/3 upcoming|upcoming lessons:\s*3/i)).toBeDefined();
      expect(screen.getByText(/active/i)).toBeDefined();
      expect(screen.getByRole("link", { name: /create|new group|new class/i })).toHaveProperty(
        "href",
        expect.stringContaining("/admin/classes/new"),
      );
      expect(screen.getByRole("link", { name: /view|details/i })).toHaveProperty(
        "href",
        expect.stringContaining("/admin/classes/group-1"),
      );
      expect(screen.getByRole("link", { name: /edit/i })).toHaveProperty(
        "href",
        expect.stringContaining("/admin/classes/group-1/edit"),
      );

      const table = screen.getByRole("table");
      expect(table.className).toContain("min-w-[1100px]");
      expect(table.parentElement?.className).toContain("overflow-x-auto");
      expect(screen.getByRole("columnheader", { name: "Status" }).className).toContain(
        "whitespace-nowrap",
      );
      expect(screen.getByRole("columnheader", { name: "Actions" }).className).toContain(
        "whitespace-nowrap",
      );
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it("forwards search, status, teacher, subject, and level filters to listAdminClassGroups", async () => {
    listAdminClassGroupsMock.mockResolvedValueOnce([]);

    const page = await loadClassesAdminPage();
    const element = await page.default({
      searchParams: {
        q: " maths ",
        status: "PAUSED",
        teacherId: "teacher-1",
        subjectId: "subject-math",
        levelId: "level-igcse",
      },
    });

    render(element);

    expect(listAdminClassGroupsMock).toHaveBeenCalledWith({
      searchQuery: "maths",
      status: "PAUSED",
      teacherId: "teacher-1",
      subjectId: "subject-math",
      levelId: "level-igcse",
    });
  });

  it("renders a class group empty state", async () => {
    listAdminClassGroupsMock.mockResolvedValueOnce([]);

    const page = await loadClassesAdminPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/no class groups|create the first class group/i)).toBeDefined();
  });
});
