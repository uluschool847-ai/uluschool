import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findAdminUserForTwoFactorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findAdminUserForTwoFactor: findAdminUserForTwoFactorMock,
}));

vi.mock("@/components/admin/two-factor-settings", () => ({
  TwoFactorSettings: ({ enabled }: { enabled: boolean }) => (
    <div>Current status: {enabled ? "enabled" : "disabled"}</div>
  ),
}));

type AdminSecurityPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadAdminSecurityPage() {
  const specifier = "@/app/(admin)/admin/security/page";
  return import(/* @vite-ignore */ specifier) as Promise<AdminSecurityPageModule>;
}

describe("Admin security page 2FA setup redirect UX", () => {
  const originalAdminRequire2FA = process.env.ADMIN_REQUIRE_2FA;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    findAdminUserForTwoFactorMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    });
  });

  afterEach(() => {
    cleanup();
    if (originalAdminRequire2FA === undefined) {
      Reflect.deleteProperty(process.env, "ADMIN_REQUIRE_2FA");
    } else {
      process.env.ADMIN_REQUIRE_2FA = originalAdminRequire2FA;
    }
  });

  it("explains the required setup redirect when ADMIN_REQUIRE_2FA is enforced", async () => {
    process.env.ADMIN_REQUIRE_2FA = "true";
    const page = await loadAdminSecurityPage();

    render(
      await page.default({
        searchParams: { setup2fa: "required", next: "/admin" },
      }),
    );

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(findAdminUserForTwoFactorMock).toHaveBeenCalledWith("admin-1");
    expect(screen.getByRole("heading", { level: 1, name: "Admin Security" })).toBeDefined();
    expect(document.body.textContent).toMatch(/2FA setup is required/i);
    expect(document.body.textContent).toMatch(/redirected here after password login/i);
    expect(document.body.textContent).toMatch(/ADMIN_REQUIRE_2FA=true/);
    expect(document.body.textContent).toMatch(/production, admin login is blocked/i);
    expect(screen.getByRole("link", { name: /set up 2fa below/i })).toHaveAttribute(
      "href",
      "#two-factor-setup",
    );
    expect(screen.queryByRole("link", { name: /continue to admin dashboard/i })).toBeNull();
    expect(screen.getByText(/current status:\s*disabled/i)).toBeDefined();
  });

  it("shows a dashboard continuation path when setup is optional for local demos", async () => {
    process.env.ADMIN_REQUIRE_2FA = "false";
    const page = await loadAdminSecurityPage();

    render(
      await page.default({
        searchParams: { setup2fa: "required", next: "/admin/tasks" },
      }),
    );

    expect(document.body.textContent).toMatch(/2FA setup is optional in this environment/i);
    expect(document.body.textContent).toMatch(/ADMIN_REQUIRE_2FA=false/);
    expect(
      screen.getAllByRole("link", { name: /continue to admin dashboard/i })[0],
    ).toHaveAttribute("href", "/admin/tasks");
    expect(screen.queryByText(/2FA setup is required/i)).toBeNull();
  });

  it("falls back to the admin dashboard when an optional next path is not an admin route", async () => {
    process.env.ADMIN_REQUIRE_2FA = "false";
    const page = await loadAdminSecurityPage();

    render(
      await page.default({
        searchParams: { next: "https://example.com/phish" },
      }),
    );

    expect(
      screen.getAllByRole("link", { name: /continue to admin dashboard/i })[0],
    ).toHaveAttribute("href", "/admin");
  });
});
