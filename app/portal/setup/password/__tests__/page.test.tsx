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
vi.mock("@/components/auth/InitialPasswordForm", () => ({
  InitialPasswordForm: () => <div data-testid="initial-password-form">Password form</div>,
}));

type PasswordPageModule = typeof import("@/app/portal/setup/password/page");

function loadPage() {
  return import("@/app/portal/setup/password/page") as Promise<PasswordPageModule>;
}

function setupSession(overrides: Record<string, unknown> = {}) {
  return {
    uid: "student-1",
    email: "student@example.com",
    role: UserRole.STUDENT,
    purpose: "INITIAL_SETUP" as const,
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

function setupUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    email: "student@example.com",
    fullName: "Student One",
    role: UserRole.STUDENT,
    passwordHash: "server-only-hash",
    mustChangePassword: true,
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorBackupCodes: [],
    ...overrides,
  };
}

describe("Initial password setup page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "ADMIN_REQUIRE_2FA");
    getInitialSetupSessionMock.mockResolvedValue(setupSession());
    findUserForInitialSetupMock.mockResolvedValue(setupUser());
  });

  afterEach(() => cleanup());

  it("is noindex and nofollow", async () => {
    const { metadata } = await loadPage();

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("redirects a missing or expired setup session to login", async () => {
    getInitialSetupSessionMock.mockResolvedValueOnce(null);
    const { default: PasswordSetupPage } = await loadPage();

    await expect(PasswordSetupPage()).rejects.toThrow("REDIRECT:/portal/login");

    expect(findUserForInitialSetupMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing user", null],
    ["inactive user", setupUser({ isActive: false })],
    ["user id mismatch", setupUser({ id: "other-user" })],
    ["role mismatch", setupUser({ role: UserRole.TEACHER })],
  ])("redirects an invalid %s setup state to login", async (_label, user) => {
    findUserForInitialSetupMock.mockResolvedValueOnce(user);
    const { default: PasswordSetupPage } = await loadPage();

    await expect(PasswordSetupPage()).rejects.toThrow("REDIRECT:/portal/login");

    expect(findUserForInitialSetupMock).toHaveBeenCalledWith("student-1");
  });

  it("renders the password form for the setup-cookie user who must rotate", async () => {
    const { default: PasswordSetupPage } = await loadPage();

    render(await PasswordSetupPage());

    expect(findUserForInitialSetupMock).toHaveBeenCalledWith("student-1");
    expect(screen.getByRole("heading", { name: /change your password/i })).toBeTruthy();
    expect(screen.getByTestId("initial-password-form")).toBeTruthy();
    expect(document.body.textContent).not.toContain("server-only-hash");
  });

  it("redirects an admin with completed rotation but required unconfigured 2FA to enrollment", async () => {
    getInitialSetupSessionMock.mockResolvedValueOnce(
      setupSession({ uid: "admin-1", email: "admin@example.com", role: UserRole.ADMIN }),
    );
    findUserForInitialSetupMock.mockResolvedValueOnce(
      setupUser({
        id: "admin-1",
        email: "admin@example.com",
        role: UserRole.ADMIN,
        mustChangePassword: false,
        twoFactorEnabled: false,
      }),
    );
    const { default: PasswordSetupPage } = await loadPage();

    await expect(PasswordSetupPage()).rejects.toThrow("REDIRECT:/portal/setup/2fa");
  });

  it("does not force 2FA enrollment after rotation when ADMIN_REQUIRE_2FA=false", async () => {
    process.env.ADMIN_REQUIRE_2FA = "false";
    getInitialSetupSessionMock.mockResolvedValueOnce(
      setupSession({ uid: "admin-1", email: "admin@example.com", role: UserRole.ADMIN }),
    );
    findUserForInitialSetupMock.mockResolvedValueOnce(
      setupUser({
        id: "admin-1",
        email: "admin@example.com",
        role: UserRole.ADMIN,
        mustChangePassword: false,
        twoFactorEnabled: false,
      }),
    );
    const { default: PasswordSetupPage } = await loadPage();

    await expect(PasswordSetupPage()).rejects.toThrow("REDIRECT:/portal/login");
    expect(redirectMock).not.toHaveBeenCalledWith("/portal/setup/2fa");
  });

  it("redirects completed non-admin setup back to login", async () => {
    findUserForInitialSetupMock.mockResolvedValueOnce(setupUser({ mustChangePassword: false }));
    const { default: PasswordSetupPage } = await loadPage();

    await expect(PasswordSetupPage()).rejects.toThrow("REDIRECT:/portal/login");
  });
});
