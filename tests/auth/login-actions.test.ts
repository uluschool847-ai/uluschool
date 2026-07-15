import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyPasswordMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const findUserByEmailMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const createAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const createInitialSetupSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const clearSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const clearAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const completeAdminTwoFactorChallengeMock = vi.hoisted(() => vi.fn());

// Mock redirect to throw an error so we can catch and assert it
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

// Mock repositories and session so the action can run without database
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: findUserByEmailMock,
  findAdminUserForTwoFactor: vi.fn(() =>
    Promise.resolve({
      id: "admin-1",
      role: "ADMIN",
      twoFactorEnabled: true,
      twoFactorSecret: "mock-secret",
    }),
  ),
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: vi.fn(() => Promise.resolve()),
  logAuthEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/repositories/admin-two-factor-challenge-repository", () => ({
  completeAdminTwoFactorChallenge: completeAdminTwoFactorChallengeMock,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: createSessionMock,
  createAdminPendingTwoFactor: createAdminPendingTwoFactorMock,
  createInitialSetupSession: createInitialSetupSessionMock,
  clearSession: clearSessionMock,
  clearAdminPendingTwoFactor: clearAdminPendingTwoFactorMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
  getAdminPendingTwoFactor: vi.fn(() =>
    Promise.resolve({
      uid: "admin-1",
      email: "admin@uluglobalacademy.com",
      challengeId: "challenge-1",
      authMethod: "password",
    }),
  ),
  getPortalRedirectPath: vi.fn((role, nextPath) => {
    // Emulate proper nextPath resolution
    if (nextPath) return nextPath;
    return role === "ADMIN" ? "/admin" : `/portal/${role.toLowerCase()}`;
  }),
}));

function expectAllAuthCookiesClearedBefore(issueMock: ReturnType<typeof vi.fn>) {
  expect(clearSessionMock).toHaveBeenCalledOnce();
  expect(clearAdminPendingTwoFactorMock).toHaveBeenCalledOnce();
  expect(clearInitialSetupSessionMock).toHaveBeenCalledOnce();

  const issueOrder = issueMock.mock.invocationCallOrder[0];
  expect(issueOrder).toBeDefined();
  expect(clearSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearAdminPendingTwoFactorMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearInitialSetupSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
}

vi.mock("@/lib/auth/two-factor", () => ({
  verifyTotpCode: vi.fn(() => true),
}));

describe("Auth Server Actions - Next Parameter Resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    findUserByEmailMock.mockResolvedValue({
      id: "user-1",
      email: "test@uluglobalacademy.com",
      fullName: "Student User",
      role: "STUDENT",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: false,
      twoFactorEnabled: false,
    });
    completeAdminTwoFactorChallengeMock.mockResolvedValue({
      outcome: "success",
      user: {
        id: "admin-1",
        email: "admin@uluglobalacademy.com",
        fullName: "Admin User",
        role: "ADMIN",
      },
    });
  });

  it("parses the next parameter and redirects to the exact intended path upon successful login", async () => {
    const { loginAction } = await import("@/app/portal/login/actions");

    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", "/portal/student/assignments?view=past");

    // The action should parse 'next' and ultimately call redirect("/portal/student/assignments?view=past")
    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/student/assignments?view=past",
    );
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1", role: "STUDENT", mfaVerified: true }),
    );
    expectAllAuthCookiesClearedBefore(createSessionMock);
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  });

  it("routes a temporary-password user to password setup without a normal session", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "user-1",
      email: "test@uluglobalacademy.com",
      fullName: "Student User",
      role: "STUDENT",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: true,
      twoFactorEnabled: false,
    });
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", "/portal/student/assignments");

    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/setup/password",
    );

    expectAllAuthCookiesClearedBefore(createInitialSetupSessionMock);
    expect(createInitialSetupSessionMock).toHaveBeenCalledWith({
      uid: "user-1",
      email: "test@uluglobalacademy.com",
      role: "STUDENT",
      nextPath: "/portal/student/assignments",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  });

  it("does not clear or issue auth cookies when password verification fails", async () => {
    verifyPasswordMock.mockResolvedValueOnce(false);
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "WrongPass123!");

    await expect(loginAction({ success: false, message: "" }, formData)).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );

    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(clearAdminPendingTwoFactorMock).not.toHaveBeenCalled();
    expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["email", new File(["not-an-email"], "email.txt"), false],
    ["password", new File(["not-a-password"], "password.txt"), false],
    ["email", null, true],
    ["password", null, true],
  ])(
    "returns invalid input before authentication when %s is not a string",
    async (field, value, omit) => {
      const { loginAction } = await import("@/app/portal/login/actions");
      const formData = new FormData();
      formData.set("email", "student@uluglobalacademy.com");
      formData.set("password", "ValidPass123!");
      if (omit) {
        formData.delete(field);
      } else {
        formData.set(field, value);
      }

      await expect(loginAction({ success: false, message: "" }, formData)).resolves.toEqual(
        expect.objectContaining({ success: false, message: "Invalid input" }),
      );

      expect(findUserByEmailMock).not.toHaveBeenCalled();
      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(clearSessionMock).not.toHaveBeenCalled();
      expect(clearAdminPendingTwoFactorMock).not.toHaveBeenCalled();
      expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
      expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
      expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a mailbox identifier longer than 254 characters before authentication", async () => {
    const oversizedEmail = `${"a".repeat(243)}@example.com`;
    expect(oversizedEmail).toHaveLength(255);
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", oversizedEmail);
    formData.set("password", "ValidPass123!");

    await expect(loginAction({ success: false, message: "" }, formData)).resolves.toEqual(
      expect.objectContaining({ success: false, message: "Invalid input" }),
    );

    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("omits a File-valued next parameter from the temporary-password setup session", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "user-1",
      email: "test@uluglobalacademy.com",
      fullName: "Student User",
      role: "STUDENT",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: true,
      twoFactorEnabled: false,
    });
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", new File(["not-a-route"], "next.txt"));

    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/setup/password",
    );

    expect(createInitialSetupSessionMock).toHaveBeenCalledWith({
      uid: "user-1",
      email: "test@uluglobalacademy.com",
      role: "STUDENT",
    });
  });

  it("parses the next parameter and redirects to the exact intended path upon successful 2FA", async () => {
    let verify2faAction:
      | ((state: { success: boolean; message: string }, formData: FormData) => Promise<unknown>)
      | undefined;
    try {
      const modulePath = "../../../app/portal/login/verify-2fa/actions";
      const module = await import(/* @vite-ignore */ modulePath);
      verify2faAction = module.verify2faAction;
    } catch (e) {
      expect(true, "Action module app/portal/login/verify-2fa/actions does not exist").toBe(false);
      return;
    }

    if (!verify2faAction) {
      expect(true, "verify2faAction not exported from module").toBe(false);
      return;
    }

    const formData = new FormData();
    formData.set("code", "123456");
    formData.set("next", "/portal/admin/settings");

    await expect(verify2faAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/admin/settings",
    );
    expect(completeAdminTwoFactorChallengeMock).toHaveBeenCalledWith({
      userId: "admin-1",
      challengeId: "challenge-1",
      authMethod: "password",
      verification: { type: "totp", code: "123456" },
    });
  });
});
