import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const findUserByEmailMock = vi.hoisted(() => vi.fn());
const createAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
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
  createAdminPendingTwoFactor: createAdminPendingTwoFactorMock,
  createSession: createSessionMock,
  getPortalRedirectPath: vi.fn((role: UserRole, nextPath?: string | null) => nextPath ?? "/admin"),
}));

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

describe("portal login admin 2FA actions", () => {
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
      twoFactorEnabled: true,
      twoFactorSecret: "SECRET123",
    });
  });

  it("routes 2FA-enabled admins to verify-2fa even in development", async () => {
    const { loginAction } = await import("@/app/portal/login/actions");

    await expect(loginAction({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/portal/login/verify-2fa?next=%2Fadmin%2Fsecurity",
    );

    expect(createAdminPendingTwoFactorMock).toHaveBeenCalledWith({
      uid: "admin-1",
      email: "admin@example.com",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ADMIN_LOGIN_PENDING_2FA" }),
    );
  });

  it("keeps development setup redirect only for admins without configured 2FA", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      fullName: "Admin User",
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash: "hashed",
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
    const { loginAction } = await import("@/app/portal/login/actions");

    await expect(loginAction({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/admin/security?setup2fa=required&next=%2Fadmin%2Fsecurity",
    );

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1", mfaVerified: true }),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ADMIN_LOGIN_2FA_REQUIRED_DEV_BYPASS" }),
    );
  });
});
