import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const findUserByEmailMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const createAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const clearSessionMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const clearAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const getPortalRedirectPathMock = vi.hoisted(() =>
  vi.fn((role: string) => (role === "ADMIN" ? "/admin" : "/portal/login")),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: findUserByEmailMock,
  findAdminUserForTwoFactor: vi.fn(),
  consumeAdminBackupCode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  clearAdminPendingTwoFactor: clearAdminPendingTwoFactorMock,
  createAdminPendingTwoFactor: createAdminPendingTwoFactorMock,
  createSession: createSessionMock,
  getAdminPendingTwoFactor: vi.fn(),
  getSession: getSessionMock,
  clearSession: clearSessionMock,
  getPortalRedirectPath: getPortalRedirectPathMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/auth/two-factor", () => ({
  verifyTotpCode: vi.fn(),
  consumeBackupCode: vi.fn(),
}));

function makeLoginFormData() {
  const formData = new FormData();
  formData.set("email", "admin@uluglobalacademy.com");
  formData.set("password", "ChangeMe123!");
  return formData;
}

describe("app/student-portal/actions.ts 2FA env defaults", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "ADMIN_REQUIRE_2FA");
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    findUserByEmailMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@uluglobalacademy.com",
      fullName: "Admin",
      role: "ADMIN",
      isActive: true,
      passwordHash: "hashed",
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
    verifyPasswordMock.mockResolvedValue(true);
    createSessionMock.mockResolvedValue(undefined);
    createAdminAuditLogMock.mockResolvedValue(undefined);
  });

  it("enforces ADMIN_REQUIRE_2FA by default and uses non-production safe bypass path", async () => {
    const { loginPortal } = await import("../../../app/student-portal/actions");

    await expect(loginPortal({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/admin/security?setup2fa=required",
    );

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ADMIN_LOGIN_2FA_REQUIRED_DEV_BYPASS",
      }),
    );
  });

  it("allows admin login without 2FA when ADMIN_REQUIRE_2FA=false", async () => {
    process.env.ADMIN_REQUIRE_2FA = "false";
    const { loginPortal } = await import("../../../app/student-portal/actions");

    await expect(loginPortal({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/admin",
    );

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ADMIN_LOGIN_PASSWORD_ONLY",
      }),
    );
  });
});
