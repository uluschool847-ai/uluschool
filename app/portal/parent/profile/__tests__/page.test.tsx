import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getParentProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/parent-profile-repository", () => ({
  getParentProfile: getParentProfileMock,
}));

type ParentProfilePageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/profile/page.tsx";

function loadPage() {
  const specifier = "@/app/portal/parent/profile/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentProfilePageModule>;
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    children: [
      {
        classGroups: [
          {
            id: "group-1",
            name: "IGCSE Mathematics A",
            subject: { id: "subject-math", name: "Mathematics" },
          },
        ],
        email: "sofia@example.com",
        id: "student-1",
        name: "Sofia Shevchenko",
      },
    ],
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    email: "parent@example.com",
    id: "parent-1",
    isActive: true,
    name: "Olena Shevchenko",
    role: UserRole.PARENT,
    status: "Active",
    updatedAt: new Date("2026-05-20T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Parent profile page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      email: "parent@example.com",
      role: UserRole.PARENT,
      uid: "parent-1",
    });
    getParentProfileMock.mockResolvedValue(profile());
  });

  afterEach(() => cleanup());

  it("uses the PARENT guard, dedicated parent profile repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-profile-repository");
    expect(source).toContain("getParentProfile(session.uid)");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("searchParams.parentId");
    expect(source).not.toContain("searchParams.studentId");
  });

  it("loads the current parent profile using session.uid and ignores spoofed query ids", async () => {
    const page = await loadPage();
    const element = await page.default({
      searchParams: { parentId: "foreign-parent", studentId: "foreign-student" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentProfileMock).toHaveBeenCalledWith("parent-1");
    expect(getParentProfileMock).not.toHaveBeenCalledWith("foreign-parent");
    expect(screen.getByRole("heading", { name: /parent profile/i })).toBeDefined();
    expect(screen.getByText("Olena Shevchenko")).toBeDefined();
    expect(screen.getByText("parent@example.com")).toBeDefined();
    expect(screen.getByText(/parent/i)).toBeDefined();
    expect(screen.getByText(/active/i)).toBeDefined();
  });

  it("renders linked children overview with class and group memberships", async () => {
    const page = await loadPage();
    const element = await page.default();
    render(element);

    const childrenRegion = screen.getByRole("region", { name: /linked children/i });
    const childCard = within(childrenRegion).getByRole("article", {
      name: /sofia shevchenko/i,
    });

    expect(within(childCard).getByText("Sofia Shevchenko")).toBeDefined();
    expect(within(childCard).getByText("sofia@example.com")).toBeDefined();
    expect(within(childCard).getByText(/igcse mathematics a/i)).toBeDefined();
    expect(within(childCard).getByText(/mathematics/i)).toBeDefined();
    expect(screen.queryByText(/unlinked child/i)).toBeNull();
  });

  it("renders an empty state for parents without linked children", async () => {
    getParentProfileMock.mockResolvedValueOnce(profile({ children: [] }));
    const page = await loadPage();
    const element = await page.default();
    render(element);

    expect(screen.getByRole("status")).toHaveTextContent(/no linked children/i);
  });

  it("renders dashboard back navigation and no profile mutation controls", async () => {
    const page = await loadPage();
    const element = await page.default();
    render(element);

    expect(screen.getByRole("link", { name: /back to parent dashboard/i })).toHaveAttribute(
      "href",
      "/portal/parent",
    );
    expect(
      screen.queryByRole("button", {
        name: /edit|save|change password|password|email|role|link child|unlink child/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", {
        name: /edit|save|change password|password|email|role|link child|unlink child/i,
      }),
    ).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not render profile/security secrets", async () => {
    getParentProfileMock.mockResolvedValueOnce(
      profile({
        passwordHash: "hashed-password",
        sessionToken: "secret-session-token",
      }),
    );
    const page = await loadPage();
    const element = await page.default();
    const { container } = render(element);

    expect(container.textContent).not.toContain("hashed-password");
    expect(container.textContent).not.toContain("secret-session-token");
  });

  it("rejects non-parent roles before loading profile data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadPage();

    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentProfileMock).not.toHaveBeenCalled();
  });
});
