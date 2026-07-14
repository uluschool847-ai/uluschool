import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);
const getInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const clearSessionMock = vi.hoisted(() => vi.fn());
const clearAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn());
const createAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const getPortalRedirectPathMock = vi.hoisted(() => vi.fn());
const accountSetupMocks = vi.hoisted(() => {
  class InitialPasswordChangeError extends Error {
    constructor(public readonly code: string) {
      super("Initial password change failed");
    }
  }

  return {
    changeInitialPassword: vi.fn(),
    InitialPasswordChangeError,
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/auth/session", () => ({
  getInitialSetupSession: getInitialSetupSessionMock,
  clearSession: clearSessionMock,
  clearAdminPendingTwoFactor: clearAdminPendingTwoFactorMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
  createSession: createSessionMock,
  createAdminPendingTwoFactor: createAdminPendingTwoFactorMock,
  getPortalRedirectPath: getPortalRedirectPathMock,
}));

vi.mock("@/lib/repositories/account-setup-repository", () => ({
  changeInitialPassword: accountSetupMocks.changeInitialPassword,
  InitialPasswordChangeError: accountSetupMocks.InitialPasswordChangeError,
}));

type PasswordActionModule = typeof import("@/app/portal/setup/password/actions");

function loadAction() {
  return import("@/app/portal/setup/password/actions") as Promise<PasswordActionModule>;
}

function validForm() {
  const formData = new FormData();
  formData.set("currentPassword", "CurrentPass123!");
  formData.set("newPassword", "NewPassword123!");
  formData.set("confirmPassword", "NewPassword123!");
  return formData;
}

function setupSession(overrides: Record<string, unknown> = {}) {
  return {
    uid: "student-1",
    email: "student@example.com",
    role: UserRole.STUDENT,
    purpose: "INITIAL_SETUP" as const,
    exp: Date.now() + 60_000,
    nextPath: "/portal/student/assignments",
    ...overrides,
  };
}

function safeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    email: "student@example.com",
    fullName: "Student One",
    role: UserRole.STUDENT,
    twoFactorEnabled: false,
    ...overrides,
  };
}

function expectNoCookieOrSessionSideEffects() {
  expect(clearSessionMock).not.toHaveBeenCalled();
  expect(clearAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
  expect(createSessionMock).not.toHaveBeenCalled();
  expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
}

function expectAllCookiesClearedBefore(issueMock: ReturnType<typeof vi.fn>) {
  expect(clearSessionMock).toHaveBeenCalledOnce();
  expect(clearAdminPendingTwoFactorMock).toHaveBeenCalledOnce();
  expect(clearInitialSetupSessionMock).toHaveBeenCalledOnce();

  const issueOrder = issueMock.mock.invocationCallOrder[0];
  expect(clearSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearAdminPendingTwoFactorMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearInitialSetupSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
}

describe("changeInitialPasswordAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "ADMIN_REQUIRE_2FA");
    getInitialSetupSessionMock.mockResolvedValue(setupSession());
    accountSetupMocks.changeInitialPassword.mockResolvedValue(safeUser());
    getPortalRedirectPathMock.mockReturnValue("/portal/student/assignments");
  });

  it.each(["missing", "expired"])(
    "returns a bounded error for a %s setup session without mutating auth cookies",
    async () => {
      getInitialSetupSessionMock.mockResolvedValueOnce(null);
      const { changeInitialPasswordAction } = await loadAction();

      const result = await changeInitialPasswordAction(
        { success: false, message: "" },
        validForm(),
      );

      expect(result).toEqual({
        success: false,
        message: "Your setup session has expired. Please sign in again.",
      });
      expect(accountSetupMocks.changeInitialPassword).not.toHaveBeenCalled();
      expectNoCookieOrSessionSideEffects();
    },
  );

  it.each(["currentPassword", "newPassword", "confirmPassword"])(
    "runtime-narrows a File-valued %s before Zod validation",
    async (field) => {
      const formData = validForm();
      formData.set(field, new File(["secret"], `${field}.txt`));
      const { changeInitialPasswordAction } = await loadAction();

      const result = await changeInitialPasswordAction({ success: false, message: "" }, formData);

      expect(result).toEqual(
        expect.objectContaining({ success: false, message: "Invalid input." }),
      );
      expect(getInitialSetupSessionMock).not.toHaveBeenCalled();
      expect(accountSetupMocks.changeInitialPassword).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("secret");
      expectNoCookieOrSessionSideEffects();
    },
  );

  it.each(["currentPassword", "newPassword", "confirmPassword"])(
    "rejects a 257-character %s before setup, repository, cookie, or session work",
    async (field) => {
      const formData = validForm();
      const overlongPassword = "a".repeat(257);
      formData.set(field, overlongPassword);
      const { changeInitialPasswordAction } = await loadAction();

      const result = await changeInitialPasswordAction({ success: false, message: "" }, formData);

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: "Invalid input.",
          errors: expect.objectContaining({
            [field]: expect.arrayContaining(["Use 256 characters or fewer."]),
          }),
        }),
      );
      expect(getInitialSetupSessionMock).not.toHaveBeenCalled();
      expect(accountSetupMocks.changeInitialPassword).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(overlongPassword);
      expectNoCookieOrSessionSideEffects();
    },
  );

  it("rejects a non-FormData input before reading fields or touching dependencies", async () => {
    const nonFormData = { get: vi.fn() };
    const { changeInitialPasswordAction } = await loadAction();

    const result = await changeInitialPasswordAction(
      { success: false, message: "" },
      nonFormData as unknown as FormData,
    );

    expect(result).toEqual({ success: false, message: "Invalid input." });
    expect(nonFormData.get).not.toHaveBeenCalled();
    expect(getInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(accountSetupMocks.changeInitialPassword).not.toHaveBeenCalled();
    expectNoCookieOrSessionSideEffects();
  });

  it("returns allowlisted field errors for a short new password", async () => {
    const formData = validForm();
    formData.set("newPassword", "TooShort1!");
    formData.set("confirmPassword", "TooShort1!");
    const { changeInitialPasswordAction } = await loadAction();

    const result = await changeInitialPasswordAction({ success: false, message: "" }, formData);

    expect(result).toEqual({
      success: false,
      message: "Invalid input.",
      errors: {
        newPassword: ["Use at least 12 characters."],
        confirmPassword: ["Use at least 12 characters."],
      },
    });
    expectNoCookieOrSessionSideEffects();
  });

  it("returns an allowlisted mismatch error", async () => {
    const formData = validForm();
    formData.set("confirmPassword", "DifferentPass123!");
    const { changeInitialPasswordAction } = await loadAction();

    const result = await changeInitialPasswordAction({ success: false, message: "" }, formData);

    expect(result).toEqual({
      success: false,
      message: "Invalid input.",
      errors: { confirmPassword: ["Passwords do not match."] },
    });
    expectNoCookieOrSessionSideEffects();
  });

  it("derives the user id only from the restricted setup session", async () => {
    const formData = validForm();
    formData.set("userId", "other-user");
    accountSetupMocks.changeInitialPassword.mockRejectedValueOnce(
      new accountSetupMocks.InitialPasswordChangeError("INVALID_CURRENT_PASSWORD"),
    );
    const { changeInitialPasswordAction } = await loadAction();

    await changeInitialPasswordAction({ success: false, message: "" }, formData);

    expect(accountSetupMocks.changeInitialPassword).toHaveBeenCalledWith(
      "student-1",
      "CurrentPass123!",
      "NewPassword123!",
    );
    expect(accountSetupMocks.changeInitialPassword).not.toHaveBeenCalledWith(
      "other-user",
      expect.anything(),
      expect.anything(),
    );
    expectNoCookieOrSessionSideEffects();
  });

  it.each([
    ["id", safeUser({ id: "other-user" })],
    ["role", safeUser({ role: UserRole.TEACHER })],
  ])("rejects a repository result with a cookie/user %s mismatch", async (_label, user) => {
    accountSetupMocks.changeInitialPassword.mockResolvedValueOnce(user);
    const { changeInitialPasswordAction } = await loadAction();

    const result = await changeInitialPasswordAction({ success: false, message: "" }, validForm());

    expect(result).toEqual({
      success: false,
      message: "Your setup session is no longer valid. Please sign in again.",
    });
    expectNoCookieOrSessionSideEffects();
  });

  it.each([
    ["INVALID_CURRENT_PASSWORD", "The current password is incorrect."],
    ["PASSWORD_REUSE", "Choose a password you have not used for this account."],
    ["INVALID_SETUP", "Your setup session is no longer valid. Please sign in again."],
  ])("maps %s to a safe error and leaves auth cookies untouched", async (code, message) => {
    accountSetupMocks.changeInitialPassword.mockRejectedValueOnce(
      new accountSetupMocks.InitialPasswordChangeError(code),
    );
    const { changeInitialPasswordAction } = await loadAction();

    const result = await changeInitialPasswordAction({ success: false, message: "" }, validForm());

    expect(result).toEqual({ success: false, message });
    expectNoCookieOrSessionSideEffects();
  });

  it("does not leak an unexpected repository failure or create session side effects", async () => {
    accountSetupMocks.changeInitialPassword.mockRejectedValueOnce(
      new Error("database included NewPassword123! and new-hash"),
    );
    const { changeInitialPasswordAction } = await loadAction();

    const result = await changeInitialPasswordAction({ success: false, message: "" }, validForm());

    expect(result).toEqual({
      success: false,
      message: "Unable to change your password. Please try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/NewPassword123!|new-hash/);
    expectNoCookieOrSessionSideEffects();
  });

  it("creates one normal session for a non-admin after clearing all auth cookies", async () => {
    const { changeInitialPasswordAction } = await loadAction();

    await expect(
      changeInitialPasswordAction({ success: false, message: "" }, validForm()),
    ).rejects.toThrow("REDIRECT:/portal/student/assignments");

    expectAllCookiesClearedBefore(createSessionMock);
    expect(createSessionMock).toHaveBeenCalledWith({
      uid: "student-1",
      role: UserRole.STUDENT,
      email: "student@example.com",
      fullName: "Student One",
      mfaVerified: true,
      authMethod: "password",
    });
    expect(createSessionMock).toHaveBeenCalledOnce();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  });

  it("hands a configured required admin to pending TOTP after clearing all auth cookies", async () => {
    getInitialSetupSessionMock.mockResolvedValueOnce(
      setupSession({ uid: "admin-1", email: "admin@example.com", role: UserRole.ADMIN }),
    );
    accountSetupMocks.changeInitialPassword.mockResolvedValueOnce(
      safeUser({
        id: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: UserRole.ADMIN,
        twoFactorEnabled: true,
      }),
    );
    const { changeInitialPasswordAction } = await loadAction();

    await expect(
      changeInitialPasswordAction({ success: false, message: "" }, validForm()),
    ).rejects.toThrow("REDIRECT:/portal/login/verify-2fa");

    expectAllCookiesClearedBefore(createAdminPendingTwoFactorMock);
    expect(createAdminPendingTwoFactorMock).toHaveBeenCalledWith({
      uid: "admin-1",
      email: "admin@example.com",
    });
    expect(createAdminPendingTwoFactorMock).toHaveBeenCalledOnce();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("retains the setup cookie for an unconfigured required admin 2FA handoff", async () => {
    getInitialSetupSessionMock.mockResolvedValueOnce(
      setupSession({ uid: "admin-1", email: "admin@example.com", role: UserRole.ADMIN }),
    );
    accountSetupMocks.changeInitialPassword.mockResolvedValueOnce(
      safeUser({
        id: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: UserRole.ADMIN,
        twoFactorEnabled: false,
      }),
    );
    const { changeInitialPasswordAction } = await loadAction();

    await expect(
      changeInitialPasswordAction({ success: false, message: "" }, validForm()),
    ).rejects.toThrow("REDIRECT:/portal/setup/2fa");

    expect(clearSessionMock).toHaveBeenCalledOnce();
    expect(clearAdminPendingTwoFactorMock).toHaveBeenCalledOnce();
    expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  });

  it("creates a normal admin session when ADMIN_REQUIRE_2FA=false", async () => {
    process.env.ADMIN_REQUIRE_2FA = "false";
    getInitialSetupSessionMock.mockResolvedValueOnce(
      setupSession({ uid: "admin-1", email: "admin@example.com", role: UserRole.ADMIN }),
    );
    accountSetupMocks.changeInitialPassword.mockResolvedValueOnce(
      safeUser({
        id: "admin-1",
        email: "admin@example.com",
        fullName: "Admin One",
        role: UserRole.ADMIN,
        twoFactorEnabled: false,
      }),
    );
    getPortalRedirectPathMock.mockReturnValueOnce("/admin");
    const { changeInitialPasswordAction } = await loadAction();

    await expect(
      changeInitialPasswordAction({ success: false, message: "" }, validForm()),
    ).rejects.toThrow("REDIRECT:/admin");

    expectAllCookiesClearedBefore(createSessionMock);
    expect(createSessionMock).toHaveBeenCalledWith({
      uid: "admin-1",
      role: UserRole.ADMIN,
      email: "admin@example.com",
      fullName: "Admin One",
      mfaVerified: false,
      authMethod: "password",
    });
    expect(createSessionMock).toHaveBeenCalledOnce();
    expect(createAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  });
});
