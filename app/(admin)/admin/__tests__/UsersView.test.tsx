import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findAllUsersMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  findAllUsers: findAllUsersMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
  }),
}));

type UsersPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element>;
};

async function loadUsersPage() {
  const specifier = "@/app/(admin)/admin/users/page";
  return import(/* @vite-ignore */ specifier) as Promise<UsersPageModule>;
}

describe("Admin user management page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders AppUser rows with clearly labeled roles", async () => {
    findAllUsersMock.mockResolvedValueOnce({
      items: [
        {
          id: "admin-1",
          email: "admin@example.com",
          fullName: "Admin User",
          role: "ADMIN",
          isActive: true,
        },
        {
          id: "teacher-1",
          email: "teacher@example.com",
          fullName: "Teacher User",
          role: "TEACHER",
          isActive: true,
        },
        {
          id: "student-1",
          email: "student@example.com",
          fullName: "Student User",
          role: "STUDENT",
          isActive: false,
        },
      ],
      totalCount: 3,
      totalPages: 1,
    });

    const page = await loadUsersPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/admin user/i)).toBeDefined();
    expect(screen.getByText(/teacher@example\.com/i)).toBeDefined();
    expect(screen.getByText(/student user/i)).toBeDefined();
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/teacher/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/student/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/inactive|disabled/i)).toBeDefined();
  }, 15_000);

  it("passes role and search URL params into findAllUsers", async () => {
    findAllUsersMock.mockResolvedValueOnce({
      items: [
        {
          id: "teacher-1",
          email: "teacher@example.com",
          fullName: "Teacher User",
          role: "TEACHER",
          isActive: true,
        },
      ],
      totalCount: 1,
      totalPages: 1,
    });

    const page = await loadUsersPage();
    const element = await page.default({
      searchParams: { role: "TEACHER", q: "teacher", page: "2" },
    });

    render(element);

    expect(findAllUsersMock).toHaveBeenCalledWith({
      page: 2,
      limit: expect.any(Number),
      role: "TEACHER",
      searchQuery: "teacher",
      sort: undefined,
    });
    expect(screen.getAllByText(/teacher user/i).length).toBeGreaterThan(0);
  });

  it("renders an empty search state when no users match filters", async () => {
    findAllUsersMock.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });

    const page = await loadUsersPage();
    const element = await page.default({
      searchParams: { role: "STUDENT", q: "missing" },
    });

    render(element);

    expect(screen.getByText(/no users|no accounts|nothing found/i)).toBeDefined();
  });

  it("preserves search, role, and sort params across pagination links", async () => {
    findAllUsersMock.mockResolvedValueOnce({
      items: [
        {
          id: "student-1",
          email: "student@example.com",
          fullName: "Student User",
          role: "STUDENT",
          isActive: true,
        },
      ],
      totalCount: 45,
      totalPages: 3,
    });

    const page = await loadUsersPage();
    const element = await page.default({
      searchParams: { role: "STUDENT", q: "student", page: "2", sort: "createdAtDesc" },
    });

    render(element);

    expect(findAllUsersMock).toHaveBeenCalledWith({
      page: 2,
      limit: expect.any(Number),
      role: "STUDENT",
      searchQuery: "student",
      sort: "createdAtDesc",
    });
    expect(screen.getByLabelText(/sort/i)).toHaveProperty("value", "createdAtDesc");
    expect(screen.getByRole("link", { name: /previous/i }).getAttribute("href")).toBe(
      "/admin/users?q=student&role=STUDENT&sort=createdAtDesc&page=1",
    );
    expect(screen.getByRole("link", { name: /^next$/i }).getAttribute("href")).toBe(
      "/admin/users?q=student&role=STUDENT&sort=createdAtDesc&page=3",
    );
  });
});
