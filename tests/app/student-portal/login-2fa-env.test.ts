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
const logAuthEventMock = vi.hoisted(() => vi.fn());
const createAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const createInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const clearSessionMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const clearAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const getPortalRedirectPathMock = vi.hoisted(() =>
  vi.fn((role: string) => (role === "ADMIN" ? "/admin" : "/portal/login")),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
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
  createInitialSetupSession: createInitialSetupSessionMock,
  createSession: createSessionMock,
  getAdminPendingTwoFactor: vi.fn(),
  getSession: getSessionMock,
  clearSession: clearSessionMock,
  getPortalRedirectPath: getPortalRedirectPathMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
  logAuthEvent: logAuthEventMock,
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
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
    verifyPasswordMock.mockResolvedValue(true);
    createSessionMock.mockResolvedValue(undefined);
    createAdminAuditLogMock.mockResolvedValue(undefined);
    logAuthEventMock.mockResolvedValue(undefined);
  });

  it("routes an admin without configured 2FA to restricted setup by default", async () => {
    const { loginPortal } = await import("../../../app/student-portal/actions");

    await expect(loginPortal({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/portal/setup/2fa",
    );

    expect(clearSessionMock).toHaveBeenCalledOnce();
    expect(clearAdminPendingTwoFactorMock).toHaveBeenCalledOnce();
    expect(createInitialSetupSessionMock).toHaveBeenCalledWith({
      uid: "admin-1",
      email: "admin@uluglobalacademy.com",
      role: "ADMIN",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("allows admin login without 2FA when ADMIN_REQUIRE_2FA=false", async () => {
    process.env.ADMIN_REQUIRE_2FA = "false";
    const { loginPortal } = await import("../../../app/student-portal/actions");

    await expect(loginPortal({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/admin",
    );

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(clearAdminPendingTwoFactorMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ADMIN_LOGIN_PASSWORD_ONLY",
      }),
    );
  });

  it("clears the session and invalidates cached protected UI on logout", async () => {
    const { logoutPortal } = await import("../../../app/student-portal/actions");

    await expect(logoutPortal()).rejects.toThrow("REDIRECT:/");

    expect(clearSessionMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
