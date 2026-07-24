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
const createInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const clearSessionMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn());
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
}));

vi.mock("@/lib/auth/session", () => ({
  createInitialSetupSession: createInitialSetupSessionMock,
  createSession: createSessionMock,
  getSession: getSessionMock,
  clearSession: clearSessionMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
  getPortalRedirectPath: getPortalRedirectPathMock,
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

function makeLoginFormData() {
  const formData = new FormData();
  formData.set("email", "admin@uluglobalacademy.com");
  formData.set("password", "ChangeMe123!");
  return formData;
}

describe("app/student-portal/actions.ts login actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    findUserByEmailMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@uluglobalacademy.com",
      fullName: "Admin",
      role: "ADMIN",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: false,
    });
    verifyPasswordMock.mockResolvedValue(true);
    createSessionMock.mockResolvedValue(undefined);
    createAdminAuditLogMock.mockResolvedValue(undefined);
    logAuthEventMock.mockResolvedValue(undefined);
  });

  it("creates an administrator password session and redirects to the dashboard", async () => {
    const { loginPortal } = await import("../../../app/student-portal/actions");

    await expect(loginPortal({ success: false, message: "" }, makeLoginFormData())).rejects.toThrow(
      "REDIRECT:/admin",
    );

    expectAllAuthCookiesClearedBefore(createSessionMock);
    expect(createSessionMock).toHaveBeenCalledWith({
      uid: "admin-1",
      email: "admin@uluglobalacademy.com",
      fullName: "Admin",
      role: "ADMIN",
      authMethod: "password",
    });
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(logAuthEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "LOGIN_SUCCESS",
        metadata: { authenticationStage: "final", authMethod: "password" },
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
