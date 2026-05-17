import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAdminParentsMock = vi.hoisted(() => vi.fn());
const SERVER_COMPONENT_TEST_TIMEOUT_MS = 15_000;

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getAdminParents: getAdminParentsMock,
}));

type ParentsAdminPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadParentsAdminPage() {
  const specifier = "@/app/(admin)/admin/parents/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentsAdminPageModule>;
}

describe("Admin parent registry page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "requires ADMIN role and renders parent registry rows with linked students",
    async () => {
      getAdminParentsMock.mockResolvedValueOnce({
        items: [
          {
            id: "parent-1",
            fullName: "Mary Parent",
            email: "mary.parent@example.com",
            phoneWhatsapp: "+254700000001",
            isActive: true,
            children: [
              {
                id: "student-1",
                fullName: "Alice Student",
                email: "alice.student@example.com",
                isActive: true,
              },
            ],
            createdAt: new Date("2026-05-01T10:00:00.000Z"),
            updatedAt: new Date("2026-05-04T10:00:00.000Z"),
          },
          {
            id: "parent-2",
            fullName: "Empty Parent",
            email: "empty.parent@example.com",
            phoneWhatsapp: null,
            isActive: false,
            children: [],
            createdAt: new Date("2026-05-02T10:00:00.000Z"),
            updatedAt: new Date("2026-05-05T10:00:00.000Z"),
          },
        ],
        totalCount: 2,
        totalPages: 1,
      });

      const page = await loadParentsAdminPage();
      const element = await page.default();

      render(element);

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(getAdminParentsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: expect.any(Number),
        }),
      );
      expect(screen.getByRole("heading", { name: /parents|guardians/i })).toBeDefined();
      expect(screen.getByText(/mary parent/i)).toBeDefined();
      expect(screen.getByText(/mary\.parent@example\.com/i)).toBeDefined();
      expect(screen.getByText(/\+254700000001/i)).toBeDefined();
      expect(screen.getByText(/alice student/i)).toBeDefined();
      expect(screen.getByText(/^Active$/i)).toBeDefined();
      expect(screen.getByText(/^Inactive$/i)).toBeDefined();
      expect(screen.getByText(/empty parent/i)).toBeDefined();
      expect(screen.getByText(/no linked students|no students linked/i)).toBeDefined();
      expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("link", { name: /view|details/i })[0]?.getAttribute("href")).toBe(
        "/admin/parents/parent-1",
      );
      expect(screen.getAllByRole("link", { name: /edit/i })[0]?.getAttribute("href")).toBe(
        "/admin/parents/parent-1/edit",
      );
      expect(screen.getByRole("button", { name: /^deactivate$/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /^activate$/i })).toBeDefined();
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it("passes search and filter params into getAdminParents", async () => {
    getAdminParentsMock.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });

    const page = await loadParentsAdminPage();
    const element = await page.default({
      searchParams: {
        q: " mary ",
        page: "2",
        isActive: "false",
        studentLinked: "true",
      },
    });

    render(element);

    expect(getAdminParentsMock).toHaveBeenCalledWith({
      page: 2,
      limit: expect.any(Number),
      searchQuery: "mary",
      isActive: false,
      studentLinked: true,
    });
  });

  it("renders an empty state when no parent accounts exist", async () => {
    getAdminParentsMock.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });

    const page = await loadParentsAdminPage();
    const element = await page.default();

    render(element);

    expect(
      screen.getByText(/no parents|no guardians|create the first parent|no parent records/i),
    ).toBeDefined();
  });
});
