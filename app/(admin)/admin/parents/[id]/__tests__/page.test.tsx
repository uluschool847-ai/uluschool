import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAdminParentByIdMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getAdminParentById: getAdminParentByIdMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type ParentDetailPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadParentDetailPage() {
  const specifier = "@/app/(admin)/admin/parents/[id]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentDetailPageModule>;
}

describe("Admin parent detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN and renders read-only parent profile, status, portal access, and linked students", async () => {
    getAdminParentByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: "+254700000001",
      role: "PARENT",
      isActive: true,
      children: [
        {
          id: "student-1",
          fullName: "Alice Student",
          email: "alice.student@example.com",
          isActive: true,
        },
        {
          id: "student-inactive",
          fullName: "Inactive Student",
          email: "inactive.student@example.com",
          isActive: false,
        },
      ],
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const page = await loadParentDetailPage();
    const element = await page.default({
      params: Promise.resolve({ id: "parent-1" }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getAdminParentByIdMock).toHaveBeenCalledWith("parent-1");
    expect(screen.getByRole("heading", { name: /parent detail|guardian detail/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /profile/i })).toBeDefined();
    expect(screen.getByText(/mary parent/i)).toBeDefined();
    expect(screen.getByText(/mary\.parent@example\.com/i)).toBeDefined();
    expect(screen.getByText(/\+254700000001/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /status/i })).toBeDefined();
    expect(screen.getByText(/^Active$/i)).toBeDefined();
    expect(screen.getByText(/portal access|parent portal/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /linked students/i })).toBeDefined();
    expect(screen.getByText(/alice student/i)).toBeDefined();
    expect(screen.getByText(/inactive student/i)).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /save|link|unlink|delete/i })).toBeNull();
  });

  it("renders safe empty state when a parent has no linked students", async () => {
    getAdminParentByIdMock.mockResolvedValueOnce({
      id: "parent-2",
      fullName: "Empty Parent",
      email: "empty.parent@example.com",
      phoneWhatsapp: null,
      role: "PARENT",
      isActive: false,
      children: [],
      createdAt: new Date("2026-05-02T10:00:00.000Z"),
      updatedAt: new Date("2026-05-05T10:00:00.000Z"),
    });

    const page = await loadParentDetailPage();
    const element = await page.default({
      params: { id: "parent-2" },
    });

    render(element);

    expect(screen.getByText(/empty parent/i)).toBeDefined();
    expect(screen.getByText(/^Inactive$/i)).toBeDefined();
    expect(screen.getByText(/no linked students|no students linked/i)).toBeDefined();
  });

  it("rejects missing or non-parent targets with notFound", async () => {
    getAdminParentByIdMock.mockResolvedValueOnce({
      id: "student-1",
      fullName: "Alice Student",
      email: "alice.student@example.com",
      role: "STUDENT",
      isActive: true,
      children: [],
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const page = await loadParentDetailPage();
    await page.default({
      params: { id: "student-1" },
    });

    expect(notFoundMock).toHaveBeenCalled();
  });
});
