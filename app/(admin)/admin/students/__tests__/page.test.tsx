import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAdminStudentsMock = vi.hoisted(() => vi.fn());
const SERVER_COMPONENT_TEST_TIMEOUT_MS = 15_000;

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getAdminStudents: getAdminStudentsMock,
}));

type StudentsAdminPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadStudentsAdminPage() {
  const specifier = "@/app/(admin)/admin/students/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentsAdminPageModule>;
}

describe("Admin student registry page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "requires ADMIN role and renders the student registry rows",
    async () => {
      getAdminStudentsMock.mockResolvedValueOnce({
        items: [
          {
            id: "student-1",
            fullName: "Alice Student",
            email: "alice.student@example.com",
            isActive: true,
            learningStatus: "TRIAL",
            parents: [
              {
                id: "parent-1",
                fullName: "Mary Parent",
                email: "mary.parent@example.com",
              },
            ],
            enrolledClasses: [
              {
                id: "class-1",
                title: "Mathematics 8A",
                teacher: { id: "teacher-1", fullName: "Jane Doe" },
              },
              {
                id: "class-2",
                title: "Physics 8A",
                teacher: { id: "teacher-2", fullName: "John Smith" },
              },
            ],
            derivedTeachers: [
              { id: "teacher-1", fullName: "Jane Doe" },
              { id: "teacher-2", fullName: "John Smith" },
            ],
            createdAt: new Date("2026-05-01T10:00:00.000Z"),
            updatedAt: new Date("2026-05-04T10:00:00.000Z"),
          },
          {
            id: "student-2",
            fullName: "Bob Student",
            email: "bob.student@example.com",
            isActive: false,
            learningStatus: "PAUSED",
            parents: [],
            enrolledClasses: [],
            derivedTeachers: [],
            createdAt: new Date("2026-05-02T10:00:00.000Z"),
            updatedAt: new Date("2026-05-05T10:00:00.000Z"),
          },
        ],
        totalCount: 2,
        totalPages: 1,
      });

      const page = await loadStudentsAdminPage();
      const element = await page.default();

      render(element);

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(getAdminStudentsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: expect.any(Number),
        }),
      );
      expect(screen.getByRole("heading", { name: /students/i })).toBeDefined();
      expect(screen.getByText(/alice student/i)).toBeDefined();
      expect(screen.getByText(/alice\.student@example\.com/i)).toBeDefined();
      expect(screen.getByText(/mary parent/i)).toBeDefined();
      expect(screen.getByText(/mathematics 8a/i)).toBeDefined();
      expect(screen.getByText(/physics 8a/i)).toBeDefined();
      expect(screen.getByText(/jane doe/i)).toBeDefined();
      expect(screen.getByText(/john smith/i)).toBeDefined();
      expect(screen.getByText(/^Active$/i)).toBeDefined();
      expect(screen.getByText(/^Inactive$/i)).toBeDefined();
      expect(screen.getByText(/^Trial$/i)).toBeDefined();
      expect(screen.getByText(/^Paused$/i)).toBeDefined();
      const editLinks = screen.getAllByRole("link", { name: /edit/i });
      expect(editLinks).toHaveLength(2);
      expect(editLinks[0]?.getAttribute("href")).toBe("/admin/students/student-1/edit");
      expect(editLinks[1]?.getAttribute("href")).toBe("/admin/students/student-2/edit");
      expect(screen.getByRole("button", { name: /^deactivate$/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /^activate$/i })).toBeDefined();
      expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
      expect(screen.getByText(/bob student/i)).toBeDefined();
      expect(screen.getByText(/bob\.student@example\.com/i)).toBeDefined();
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it("passes search and filter URL params into getAdminStudents", async () => {
    getAdminStudentsMock.mockResolvedValueOnce({
      items: [
        {
          id: "student-1",
          fullName: "Alice Student",
          email: "alice.student@example.com",
          isActive: true,
          learningStatus: "PAUSED",
          parents: [],
          enrolledClasses: [],
          derivedTeachers: [],
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          updatedAt: new Date("2026-05-04T10:00:00.000Z"),
        },
      ],
      totalCount: 1,
      totalPages: 1,
    });

    const page = await loadStudentsAdminPage();
    const element = await page.default({
      searchParams: {
        q: " alice ",
        page: "3",
        isActive: "false",
        learningStatus: "PAUSED",
        parentLinked: "false",
        classLinked: "true",
      },
    });

    render(element);

    expect(getAdminStudentsMock).toHaveBeenCalledWith({
      page: 3,
      limit: expect.any(Number),
      searchQuery: "alice",
      isActive: false,
      learningStatus: "PAUSED",
      parentLinked: false,
      classLinked: true,
      sort: undefined,
    });
    expect(screen.getByText(/alice student/i)).toBeDefined();
  });

  it("preserves search, filters, and sort params across pagination links", async () => {
    getAdminStudentsMock.mockResolvedValueOnce({
      items: [
        {
          id: "student-1",
          fullName: "Alice Student",
          email: "alice.student@example.com",
          isActive: false,
          learningStatus: "PAUSED",
          parents: [],
          enrolledClasses: [],
          derivedTeachers: [],
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          updatedAt: new Date("2026-05-04T10:00:00.000Z"),
        },
      ],
      totalCount: 45,
      totalPages: 3,
    });

    const page = await loadStudentsAdminPage();
    const element = await page.default({
      searchParams: {
        q: "alice",
        page: "2",
        isActive: "false",
        learningStatus: "PAUSED",
        parentLinked: "false",
        classLinked: "true",
        sort: "nameDesc",
      },
    });

    render(element);

    expect(getAdminStudentsMock).toHaveBeenCalledWith({
      page: 2,
      limit: expect.any(Number),
      searchQuery: "alice",
      isActive: false,
      learningStatus: "PAUSED",
      parentLinked: false,
      classLinked: true,
      sort: "nameDesc",
    });
    expect(screen.getByLabelText(/sort/i)).toHaveProperty("value", "nameDesc");
    expect(screen.getByRole("link", { name: /previous/i }).getAttribute("href")).toBe(
      "/admin/students?q=alice&isActive=false&learningStatus=PAUSED&parentLinked=false&classLinked=true&sort=nameDesc&page=1",
    );
    expect(screen.getByRole("link", { name: /^next$/i }).getAttribute("href")).toBe(
      "/admin/students?q=alice&isActive=false&learningStatus=PAUSED&parentLinked=false&classLinked=true&sort=nameDesc&page=3",
    );
  });

  it("renders an empty state when no students exist", async () => {
    getAdminStudentsMock.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });

    const page = await loadStudentsAdminPage();
    const element = await page.default();

    render(element);

    expect(
      screen.getByText(
        /no students|no student registry|no student records|create the first student/i,
      ),
    ).toBeDefined();
  });

  it("renders students without linked parents or classes safely", async () => {
    getAdminStudentsMock.mockResolvedValueOnce({
      items: [
        {
          id: "student-1",
          fullName: "Sam Student",
          email: "sam.student@example.com",
          isActive: true,
          learningStatus: "TRIAL",
          parents: [],
          enrolledClasses: [],
          derivedTeachers: [],
          createdAt: new Date("2026-05-03T10:00:00.000Z"),
          updatedAt: new Date("2026-05-06T10:00:00.000Z"),
        },
      ],
      totalCount: 1,
      totalPages: 1,
    });

    const page = await loadStudentsAdminPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/sam student/i)).toBeDefined();
    expect(screen.getByText(/sam\.student@example\.com/i)).toBeDefined();
    expect(screen.getByText(/^Active$/i)).toBeDefined();
  });

  it("renders a lifecycle status filter without confusing it with account access", async () => {
    getAdminStudentsMock.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });

    const page = await loadStudentsAdminPage();
    const element = await page.default({
      searchParams: {
        learningStatus: "TRIAL",
        isActive: "true",
      },
    });

    render(element);

    expect(getAdminStudentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        learningStatus: "TRIAL",
        isActive: true,
      }),
    );
    expect(screen.getByLabelText(/learning status|lifecycle status/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /trial/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^active$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /paused/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^inactive$/i })).toBeDefined();
  });
});
