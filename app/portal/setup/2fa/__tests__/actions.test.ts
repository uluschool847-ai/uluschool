import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const clearSessionMock = vi.hoisted(() => vi.fn());
const clearAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn());
const getPortalRedirectPathMock = vi.hoisted(() => vi.fn());
const generateTwoFactorSecretMock = vi.hoisted(() => vi.fn());
const getTotpUriMock = vi.hoisted(() => vi.fn());
const verifyTotpCodeMock = vi.hoisted(() => vi.fn());
const generateBackupCodesMock = vi.hoisted(() => vi.fn());
const repositoryMocks = vi.hoisted(() => {
  class InitialAdminTwoFactorEnrollmentError extends Error {
    constructor(public readonly code: string) {
      super("Initial admin two-factor enrollment failed");
    }
  }

  return {
    getEnrollment: vi.fn(),
    beginEnrollment: vi.fn(),
    confirmEnrollment: vi.fn(),
    InitialAdminTwoFactorEnrollmentError,
  };
});

vi.mock("@/lib/auth/session", () => ({
  getInitialSetupSession: getInitialSetupSessionMock,
  clearSession: clearSessionMock,
  clearAdminPendingTwoFactor: clearAdminPendingTwoFactorMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
  createSession: createSessionMock,
  getPortalRedirectPath: getPortalRedirectPathMock,
}));

vi.mock("@/lib/auth/two-factor", () => ({
  generateTwoFactorSecret: generateTwoFactorSecretMock,
  getTotpUri: getTotpUriMock,
  verifyTotpCode: verifyTotpCodeMock,
  generateBackupCodes: generateBackupCodesMock,
}));

vi.mock("@/lib/repositories/account-setup-repository", () => ({
  getInitialAdminTwoFactorEnrollment: repositoryMocks.getEnrollment,
  beginInitialAdminTwoFactorEnrollment: repositoryMocks.beginEnrollment,
  confirmInitialAdminTwoFactorEnrollment: repositoryMocks.confirmEnrollment,
  InitialAdminTwoFactorEnrollmentError: repositoryMocks.InitialAdminTwoFactorEnrollmentError,
}));

type ActionModule = typeof import("@/app/portal/setup/2fa/actions");

function loadActions() {
  return import("@/app/portal/setup/2fa/actions") as Promise<ActionModule>;
}

function setupSession(overrides: Record<string, unknown> = {}) {
  return {
    uid: "admin-1",
    email: "admin@example.com",
    role: UserRole.ADMIN,
    purpose: "INITIAL_SETUP" as const,
    exp: Date.now() + 60_000,
    nextPath: "/admin/classes",
    ...overrides,
  };
}

function adminEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Admin One",
    role: UserRole.ADMIN,
    twoFactorEnabled: false,
    twoFactorSecret: "PERSISTED-SECRET",
    ...overrides,
  };
}

function formWithCode(code: FormDataEntryValue = "123456") {
  const formData = new FormData();
  formData.set("code", code);
  return formData;
}

function emptyForm() {
  return new FormData();
}

function expectNoNormalSessionSideEffects() {
  expect(clearSessionMock).not.toHaveBeenCalled();
  expect(clearAdminPendingTwoFactorMock).not.toHaveBeenCalled();
  expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
  expect(createSessionMock).not.toHaveBeenCalled();
}

function expectAllAuthCookiesClearedBeforeSession() {
  expect(clearSessionMock).toHaveBeenCalledOnce();
  expect(clearAdminPendingTwoFactorMock).toHaveBeenCalledOnce();
  expect(clearInitialSetupSessionMock).toHaveBeenCalledOnce();
  expect(createSessionMock).toHaveBeenCalledOnce();

  const issueOrder = createSessionMock.mock.invocationCallOrder[0];
  expect(clearSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearAdminPendingTwoFactorMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearInitialSetupSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
}

describe("restricted initial admin 2FA actions", () => {
  const plainCodes = Array.from({ length: 8 }, (_, index) => `PLAIN-${index + 1}`);
  const hashedCodes = Array.from({ length: 8 }, (_, index) => `HASH-${index + 1}`);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getInitialSetupSessionMock.mockResolvedValue(setupSession());
    generateTwoFactorSecretMock.mockReturnValue("NEW-SECRET");
    getTotpUriMock.mockReturnValue("otpauth://restricted-uri");
    verifyTotpCodeMock.mockReturnValue(true);
    generateBackupCodesMock.mockResolvedValue({ plain: plainCodes, hashed: hashedCodes });
    repositoryMocks.getEnrollment.mockResolvedValue(adminEnrollment());
    repositoryMocks.beginEnrollment.mockResolvedValue(
      adminEnrollment({ twoFactorSecret: "NEW-SECRET" }),
    );
    repositoryMocks.confirmEnrollment.mockResolvedValue(
      adminEnrollment({ twoFactorEnabled: true, twoFactorSecret: undefined }),
    );
    getPortalRedirectPathMock.mockReturnValue("/admin/classes");
  });

  it("runtime-narrows begin FormData before reading setup or generating a secret", async () => {
    const malformed = { get: vi.fn() };
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      malformed as unknown as FormData,
    );

    expect(result).toEqual({ phase: "error", success: false, message: "Invalid input." });
    expect(malformed.get).not.toHaveBeenCalled();
    expect(getInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(generateTwoFactorSecretMock).not.toHaveBeenCalled();
    expect(repositoryMocks.beginEnrollment).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it.each([
    ["missing or expired", null],
    ["non-admin", setupSession({ role: UserRole.TEACHER })],
  ])("rejects a %s setup cookie before secret generation", async (_label, setup) => {
    getInitialSetupSessionMock.mockResolvedValueOnce(setup);
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      emptyForm(),
    );

    expect(result).toMatchObject({ phase: "error", success: false });
    expect(generateTwoFactorSecretMock).not.toHaveBeenCalled();
    expect(repositoryMocks.beginEnrollment).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it("starts enrollment from cookie identity without creating or clearing any auth session", async () => {
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      emptyForm(),
    );

    expect(repositoryMocks.beginEnrollment).toHaveBeenCalledWith({
      userId: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      secret: "NEW-SECRET",
    });
    expect(result).toEqual({
      phase: "setup",
      success: true,
      message: "Add this account to your authenticator app, then confirm the code.",
      setupSecret: "NEW-SECRET",
      otpAuthUrl: "otpauth://restricted-uri",
    });
    expectNoNormalSessionSideEffects();
  });

  it("does not leak an already-enabled secret or create a session", async () => {
    repositoryMocks.beginEnrollment.mockRejectedValueOnce(
      new repositoryMocks.InitialAdminTwoFactorEnrollmentError("ALREADY_ENABLED"),
    );
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      emptyForm(),
    );

    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Two-factor authentication is already enabled.",
    });
    expect(JSON.stringify(result)).not.toMatch(/NEW-SECRET|otpauth/i);
    expectNoNormalSessionSideEffects();
  });

  it("bounds a sensitive secret-generation failure without session side effects", async () => {
    generateTwoFactorSecretMock.mockImplementationOnce(() => {
      throw new Error("generated NEW-SECRET with signing value");
    });
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      emptyForm(),
    );

    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Unable to start two-factor setup. Please try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/NEW-SECRET|signing/i);
    expect(repositoryMocks.beginEnrollment).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it.each(["12345", "1234567", "１２３４５６", " 123456", "123456 ", "12345a"])(
    "rejects malformed code %j before setup, repository, or TOTP calls",
    async (code) => {
      const { confirmInitialTwoFactorSetupAction } = await loadActions();

      const result = await confirmInitialTwoFactorSetupAction(
        { phase: "idle", success: false, message: "" },
        formWithCode(code),
      );

      expect(result).toEqual({
        phase: "error",
        success: false,
        message: "Enter a 6-digit authenticator code.",
      });
      expect(getInitialSetupSessionMock).not.toHaveBeenCalled();
      expect(repositoryMocks.getEnrollment).not.toHaveBeenCalled();
      expect(verifyTotpCodeMock).not.toHaveBeenCalled();
      expectNoNormalSessionSideEffects();
    },
  );

  it("rejects File-valued and non-FormData code containers before security calls", async () => {
    const fileForm = formWithCode(new File(["123456"], "code.txt"));
    const malformed = { get: vi.fn() };
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    for (const input of [fileForm, malformed as unknown as FormData]) {
      const result = await confirmInitialTwoFactorSetupAction(
        { phase: "idle", success: false, message: "" },
        input,
      );
      expect(result).toMatchObject({ phase: "error", success: false });
    }

    expect(malformed.get).not.toHaveBeenCalled();
    expect(getInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(repositoryMocks.getEnrollment).not.toHaveBeenCalled();
    expect(verifyTotpCodeMock).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it.each([
    ["missing or expired", null],
    ["non-admin", setupSession({ role: UserRole.STUDENT })],
  ])("rejects a %s confirmation setup cookie without TOTP work", async (_label, setup) => {
    getInitialSetupSessionMock.mockResolvedValueOnce(setup);
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(result).toMatchObject({ phase: "error", success: false });
    expect(repositoryMocks.getEnrollment).not.toHaveBeenCalled();
    expect(verifyTotpCodeMock).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it("bounds a sensitive setup-cookie read failure before repository or TOTP work", async () => {
    getInitialSetupSessionMock.mockRejectedValueOnce(
      new Error("cookie signing value PERSISTED-SECRET"),
    );
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Unable to enable two-factor authentication. Please try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/cookie|signing|PERSISTED-SECRET/);
    expect(repositoryMocks.getEnrollment).not.toHaveBeenCalled();
    expect(verifyTotpCodeMock).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it("verifies the currently persisted secret and keeps the setup cookie on invalid TOTP", async () => {
    verifyTotpCodeMock.mockReturnValueOnce(false);
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(repositoryMocks.getEnrollment).toHaveBeenCalledWith({
      userId: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
    });
    expect(verifyTotpCodeMock).toHaveBeenCalledWith("123456", "PERSISTED-SECRET");
    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Invalid authenticator code. Check the device time and try again.",
    });
    expect(generateBackupCodesMock).not.toHaveBeenCalled();
    expect(repositoryMocks.confirmEnrollment).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it("rejects malformed generated backup-code sets before persistence", async () => {
    generateBackupCodesMock.mockResolvedValueOnce({
      plain: Array(8).fill("DUPLICATE"),
      hashed: Array(8).fill("DUPLICATE-HASH"),
    });
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Unable to enable two-factor authentication. Please try again.",
    });
    expect(repositoryMocks.confirmEnrollment).not.toHaveBeenCalled();
    expectNoNormalSessionSideEffects();
  });

  it("atomically confirms, clears every auth cookie, and creates exactly one verified session", async () => {
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(repositoryMocks.confirmEnrollment).toHaveBeenCalledWith({
      userId: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      expectedSecret: "PERSISTED-SECRET",
      backupCodeHashes: hashedCodes,
    });
    expectAllAuthCookiesClearedBeforeSession();
    expect(createSessionMock).toHaveBeenCalledWith({
      uid: "admin-1",
      role: UserRole.ADMIN,
      email: "admin@example.com",
      fullName: "Admin One",
      mfaVerified: true,
      authMethod: "password",
    });
    expect(getPortalRedirectPathMock).toHaveBeenCalledWith(UserRole.ADMIN, "/admin/classes");
    expect(result).toEqual({
      phase: "complete",
      success: true,
      message: "Two-factor authentication is enabled. Save these backup codes now.",
      backupCodes: plainCodes,
      continueHref: "/admin/classes",
    });
    expect(new Set(result.phase === "complete" ? result.backupCodes : [])).toHaveLength(8);
    expect(JSON.stringify(result)).not.toMatch(/PERSISTED-SECRET|HASH-1|otpauth|cookie|signing/i);
  });

  it("keeps the setup cookie and leaks no values when the transaction rejects a race", async () => {
    repositoryMocks.confirmEnrollment.mockRejectedValueOnce(
      new repositoryMocks.InitialAdminTwoFactorEnrollmentError("SECRET_CHANGED"),
    );
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Your two-factor setup changed. Start setup again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/PERSISTED-SECRET|PLAIN-1|HASH-1/);
    expectNoNormalSessionSideEffects();
  });

  it("maps unexpected sensitive failures to a bounded response with no auth mutation", async () => {
    repositoryMocks.getEnrollment.mockRejectedValueOnce(
      new Error("cookie signing value PERSISTED-SECRET 123456 HASH-1"),
    );
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      formWithCode(),
    );

    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Unable to enable two-factor authentication. Please try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/cookie|signing|PERSISTED-SECRET|123456|HASH-1/);
    expectNoNormalSessionSideEffects();
  });
});
