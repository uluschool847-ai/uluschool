import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);
const getInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const findUserForInitialSetupMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth/session", () => ({
  getInitialSetupSession: getInitialSetupSessionMock,
}));
vi.mock("@/lib/repositories/user-repository", () => ({
  findUserForInitialSetup: findUserForInitialSetupMock,
}));
vi.mock("@/components/auth/InitialTwoFactorForm", () => ({
  InitialTwoFactorForm: () => <div data-testid="initial-two-factor-form">2FA form</div>,
}));

type PageModule = typeof import("@/app/portal/setup/2fa/page");

function loadPage() {
  return import("@/app/portal/setup/2fa/page") as Promise<PageModule>;
}

function setupSession(overrides: Record<string, unknown> = {}) {
  return {
    uid: "admin-1",
    email: "admin@example.com",
    role: UserRole.ADMIN,
    purpose: "INITIAL_SETUP" as const,
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Admin One",
    role: UserRole.ADMIN,
    passwordHash: "server-only-hash",
    mustChangePassword: false,
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: "server-only-secret",
    twoFactorBackupCodes: ["server-only-backup-hash"],
    ...overrides,
  };
}

describe("restricted initial admin 2FA page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getInitialSetupSessionMock.mockResolvedValue(setupSession());
    findUserForInitialSetupMock.mockResolvedValue(adminUser());
  });

  afterEach(() => cleanup());

  it("is noindex and nofollow", async () => {
    const { metadata } = await loadPage();

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("redirects missing or expired setup to login before a user lookup", async () => {
    getInitialSetupSessionMock.mockResolvedValueOnce(null);
    const { default: Page } = await loadPage();

    await expect(Page()).rejects.toThrow("REDIRECT:/portal/login");
    expect(findUserForInitialSetupMock).not.toHaveBeenCalled();
  });

  it.each([UserRole.TEACHER, UserRole.STUDENT, UserRole.PARENT])(
    "redirects a %s setup identity to unauthorized",
    async (role) => {
      getInitialSetupSessionMock.mockResolvedValueOnce(setupSession({ role }));
      const { default: Page } = await loadPage();

      await expect(Page()).rejects.toThrow("REDIRECT:/portal/unauthorized");
      expect(findUserForInitialSetupMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing user", null],
    ["inactive user", adminUser({ isActive: false })],
    ["id mismatch", adminUser({ id: "other-admin" })],
    ["email mismatch", adminUser({ email: "changed@example.com" })],
  ])("redirects an invalid %s state to login", async (_label, user) => {
    findUserForInitialSetupMock.mockResolvedValueOnce(user);
    const { default: Page } = await loadPage();

    await expect(Page()).rejects.toThrow("REDIRECT:/portal/login");
  });

  it("redirects a persisted role change to unauthorized", async () => {
    findUserForInitialSetupMock.mockResolvedValueOnce(adminUser({ role: UserRole.TEACHER }));
    const { default: Page } = await loadPage();

    await expect(Page()).rejects.toThrow("REDIRECT:/portal/unauthorized");
  });

  it("redirects an admin with a pending password change to password setup", async () => {
    findUserForInitialSetupMock.mockResolvedValueOnce(adminUser({ mustChangePassword: true }));
    const { default: Page } = await loadPage();

    await expect(Page()).rejects.toThrow("REDIRECT:/portal/setup/password");
  });

  it("redirects an already-enabled admin to login", async () => {
    findUserForInitialSetupMock.mockResolvedValueOnce(adminUser({ twoFactorEnabled: true }));
    const { default: Page } = await loadPage();

    await expect(Page()).rejects.toThrow("REDIRECT:/portal/login");
  });

  it("renders only the restricted form for the eligible cookie admin", async () => {
    const { default: Page } = await loadPage();

    render(await Page());

    expect(findUserForInitialSetupMock).toHaveBeenCalledWith("admin-1");
    expect(
      screen.getByRole("heading", { name: /secure your administrator account/i }),
    ).toBeTruthy();
    expect(screen.getByTestId("initial-two-factor-form")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/server-only-secret|server-only-backup-hash/);
  });
});
