import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const findUserByEmailMock = vi.hoisted(() => vi.fn());
const clearSessionMock = vi.hoisted(() => vi.fn());
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const createInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const logAuthEventMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: findUserByEmailMock,
}));

vi.mock("@/lib/auth/session", () => ({
  clearSession: clearSessionMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
  createInitialSetupSession: createInitialSetupSessionMock,
  createSession: createSessionMock,
  getPortalRedirectPath: vi.fn((role: UserRole, nextPath?: string | null) => nextPath ?? "/admin"),
}));

function expectAllAuthCookiesClearedBefore(issueMock: ReturnType<typeof vi.fn>) {
  expect(clearSessionMock).toHaveBeenCalledOnce();
  expect(clearInitialSetupSessionMock).toHaveBeenCalledOnce();

  const issueOrder = issueMock.mock.invocationCallOrder[0];
  expect(issueOrder).toBeDefined();
  expect(clearSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearInitialSetupSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
}

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
  logAuthEvent: logAuthEventMock,
}));

function makeLoginFormData(nextPath = "/admin/security") {
  const formData = new FormData();
  formData.set("email", "admin@example.com");
  formData.set("password", "ChangeMe123!");
  formData.set("next", nextPath);
  return formData;
}

describe("portal login administrator actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "ADMIN_REQUIRE_2FA");
    process.env.NODE_ENV = "development";
    verifyPasswordMock.mockResolvedValue(true);
    createAdminAuditLogMock.mockResolvedValue(undefined);
    logAuthEventMock.mockResolvedValue(undefined);
    findUserByEmailMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      fullName: "Admin User",
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: false,
      twoFactorEnabled: true,
      twoFactorSecret: "SECRET123",
    });
  });

  it("creates a normal administrator session after valid password authentication", async () => {
    const { loginAction } = await import("@/app/portal/login/actions");

    await expect(loginAction({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/admin/security",
    );

    expect(createSessionMock).toHaveBeenCalledWith({
      uid: "admin-1",
      email: "admin@example.com",
      fullName: "Admin User",
      role: UserRole.ADMIN,
      authMethod: "password",
    });
    expectAllAuthCookiesClearedBefore(createSessionMock);
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(logAuthEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "LOGIN_SUCCESS",
        userId: "admin-1",
        identifier: "admin@example.com",
        metadata: { authenticationStage: "final", authMethod: "password" },
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("routes password setup before creating an administrator session", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      fullName: "Admin User",
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
    const { loginAction } = await import("@/app/portal/login/actions");

    await expect(loginAction({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/portal/setup/password",
    );

    expect(createInitialSetupSessionMock).toHaveBeenCalled();
    expectAllAuthCookiesClearedBefore(createInitialSetupSessionMock);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
