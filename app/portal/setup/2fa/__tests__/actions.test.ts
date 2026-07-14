import { UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  getInitialSetupSession: vi.fn(),
  createSetupCapability: vi.fn(),
  readSetupCapability: vi.fn(),
  createHandoffCapability: vi.fn(),
  readHandoffCapability: vi.fn(),
  getSecretFingerprint: vi.fn(),
  prepareSessionCookie: vi.fn(),
  replaceAuthCookieFamily: vi.fn(),
  getPortalRedirectPath: vi.fn(),
}));
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
    getHandoff: vi.fn(),
    beginEnrollment: vi.fn(),
    confirmEnrollment: vi.fn(),
    recoverHandoff: vi.fn(),
    InitialAdminTwoFactorEnrollmentError,
  };
});

vi.mock("@/lib/auth/session", () => ({
  getInitialSetupSession: sessionMocks.getInitialSetupSession,
  createInitialTwoFactorSetupCapability: sessionMocks.createSetupCapability,
  readInitialTwoFactorSetupCapability: sessionMocks.readSetupCapability,
  createInitialTwoFactorHandoffCapability: sessionMocks.createHandoffCapability,
  readInitialTwoFactorHandoffCapability: sessionMocks.readHandoffCapability,
  getInitialTwoFactorSecretFingerprint: sessionMocks.getSecretFingerprint,
  prepareSessionCookie: sessionMocks.prepareSessionCookie,
  replaceAuthCookieFamilyWithSession: sessionMocks.replaceAuthCookieFamily,
  getPortalRedirectPath: sessionMocks.getPortalRedirectPath,
}));

vi.mock("@/lib/auth/two-factor", () => ({
  generateTwoFactorSecret: generateTwoFactorSecretMock,
  getTotpUri: getTotpUriMock,
  verifyTotpCode: verifyTotpCodeMock,
  generateBackupCodes: generateBackupCodesMock,
}));

vi.mock("@/lib/repositories/account-setup-repository", () => ({
  getInitialAdminTwoFactorEnrollment: repositoryMocks.getEnrollment,
  getInitialAdminTwoFactorHandoff: repositoryMocks.getHandoff,
  beginInitialAdminTwoFactorEnrollment: repositoryMocks.beginEnrollment,
  confirmInitialAdminTwoFactorEnrollment: repositoryMocks.confirmEnrollment,
  recoverInitialAdminTwoFactorHandoff: repositoryMocks.recoverHandoff,
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
    twoFactorSecret: "JBSWY3DPEHPK3PXP",
    ...overrides,
  };
}

function confirmationForm(code: FormDataEntryValue = "123456", capability = "SIGNED-CAPABILITY") {
  const formData = new FormData();
  formData.set("code", code);
  formData.set("setupCapability", capability);
  return formData;
}

function emptyForm() {
  return new FormData();
}

function handoffForm(capability: FormDataEntryValue = "SIGNED-HANDOFF-CAPABILITY") {
  const formData = new FormData();
  formData.set("handoffCapability", capability);
  return formData;
}

describe("restricted initial admin 2FA actions", () => {
  const plainCodes = Array.from({ length: 8 }, (_, index) => `PLAIN-${index + 1}`);
  const hashedCodes = Array.from(
    { length: 8 },
    (_, index) => `${(index + 1).toString().repeat(32)}:${(index + 1).toString().repeat(128)}`,
  );
  const preparedSession = {
    name: "ulu_session",
    value: "SIGNED-NORMAL-SESSION",
    options: { httpOnly: true },
  };
  const committedHashFingerprint = "f".repeat(64);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sessionMocks.getInitialSetupSession.mockResolvedValue(setupSession());
    sessionMocks.createSetupCapability.mockResolvedValue("SIGNED-CAPABILITY");
    sessionMocks.readSetupCapability.mockResolvedValue({
      purpose: "INITIAL_2FA_SETUP",
      uid: "admin-1",
      secretFingerprint: "CURRENT-FINGERPRINT",
      exp: Date.now() + 60_000,
    });
    sessionMocks.getSecretFingerprint.mockResolvedValue("CURRENT-FINGERPRINT");
    sessionMocks.createHandoffCapability.mockResolvedValue("SIGNED-HANDOFF-CAPABILITY");
    sessionMocks.readHandoffCapability.mockResolvedValue({
      purpose: "INITIAL_2FA_HANDOFF",
      uid: "admin-1",
      backupCodeHashFingerprint: committedHashFingerprint,
      iat: Date.now(),
      exp: Date.now() + 10 * 60_000,
    });
    sessionMocks.prepareSessionCookie.mockResolvedValue(preparedSession);
    sessionMocks.replaceAuthCookieFamily.mockResolvedValue(undefined);
    sessionMocks.getPortalRedirectPath.mockReturnValue("/admin/classes");
    generateTwoFactorSecretMock.mockReturnValue("KRSXG5DSNFXGOIDB");
    getTotpUriMock.mockReturnValue("otpauth://restricted-uri");
    verifyTotpCodeMock.mockReturnValue(true);
    generateBackupCodesMock.mockResolvedValue({ plain: plainCodes, hashed: hashedCodes });
    repositoryMocks.getEnrollment.mockResolvedValue(adminEnrollment());
    repositoryMocks.getHandoff.mockResolvedValue(
      adminEnrollment({ twoFactorEnabled: true, twoFactorSecret: undefined }),
    );
    repositoryMocks.beginEnrollment.mockResolvedValue(
      adminEnrollment({ twoFactorSecret: "KRSXG5DSNFXGOIDB" }),
    );
    repositoryMocks.confirmEnrollment.mockResolvedValue(
      adminEnrollment({ twoFactorEnabled: true, twoFactorSecret: undefined }),
    );
    repositoryMocks.recoverHandoff.mockResolvedValue(
      adminEnrollment({ twoFactorEnabled: true, twoFactorSecret: undefined }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runtime-narrows begin FormData before setup or secret work", async () => {
    const malformed = { get: vi.fn() };
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      malformed as unknown as FormData,
    );

    expect(result).toEqual({ phase: "error", success: false, message: "Invalid input." });
    expect(sessionMocks.getInitialSetupSession).not.toHaveBeenCalled();
    expect(repositoryMocks.beginEnrollment).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["non-admin", setupSession({ role: UserRole.TEACHER })],
  ])("rejects a %s setup identity before enrollment", async (_label, setup) => {
    sessionMocks.getInitialSetupSession.mockResolvedValueOnce(setup);
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      emptyForm(),
    );

    expect(result).toMatchObject({ phase: "error", success: false });
    expect(repositoryMocks.beginEnrollment).not.toHaveBeenCalled();
  });

  it("starts enrollment with signed freshness capability and no client identity", async () => {
    const { beginInitialTwoFactorSetupAction } = await loadActions();

    const result = await beginInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      emptyForm(),
    );

    expect(repositoryMocks.beginEnrollment).toHaveBeenCalledWith({
      userId: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      secret: "KRSXG5DSNFXGOIDB",
    });
    expect(sessionMocks.createSetupCapability).toHaveBeenCalledWith({
      uid: "admin-1",
      secret: "KRSXG5DSNFXGOIDB",
    });
    expect(result).toEqual({
      phase: "setup",
      success: true,
      message: "Add this account to your authenticator app, then confirm the code.",
      setupSecret: "KRSXG5DSNFXGOIDB",
      otpAuthUrl: "otpauth://restricted-uri",
      setupCapability: "SIGNED-CAPABILITY",
    });
  });

  it.each(["12345", "1234567", "１２３４５６", " 123456", "12345a"])(
    "rejects malformed code %j before setup or TOTP work",
    async (code) => {
      const { confirmInitialTwoFactorSetupAction } = await loadActions();

      const result = await confirmInitialTwoFactorSetupAction(
        { phase: "idle", success: false, message: "" },
        confirmationForm(code),
      );

      expect(result).toEqual({
        phase: "error",
        success: false,
        message: "Enter a 6-digit authenticator code.",
      });
      expect(sessionMocks.getInitialSetupSession).not.toHaveBeenCalled();
      expect(verifyTotpCodeMock).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed or File-valued setup capabilities before setup work", async () => {
    const missing = confirmationForm();
    missing.delete("setupCapability");
    const file = confirmationForm();
    file.set("setupCapability", new File(["signed"], "capability.txt"));
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    for (const form of [missing, file, confirmationForm("123456", "x".repeat(1025))]) {
      const result = await confirmInitialTwoFactorSetupAction(
        { phase: "idle", success: false, message: "" },
        form,
      );
      expect(result).toMatchObject({ phase: "restart-required", success: false });
    }

    expect(sessionMocks.getInitialSetupSession).not.toHaveBeenCalled();
    expect(repositoryMocks.getEnrollment).not.toHaveBeenCalled();
  });

  it("returns restart-required before TOTP when another tab already rotated the displayed setup", async () => {
    sessionMocks.getSecretFingerprint.mockResolvedValueOnce("ROTATED-FINGERPRINT");
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );

    expect(result).toEqual({
      phase: "restart-required",
      success: false,
      message: "Your two-factor setup changed. Start setup again.",
    });
    expect(verifyTotpCodeMock).not.toHaveBeenCalled();
    expect(generateBackupCodesMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/JBSWY3DPEHPK3PXP|otpauth/i);
  });

  it("keeps same-version setup available after an invalid TOTP", async () => {
    verifyTotpCodeMock.mockReturnValueOnce(false);
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );

    expect(verifyTotpCodeMock).toHaveBeenCalledWith("123456", "JBSWY3DPEHPK3PXP");
    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Invalid authenticator code. Check the device time and try again.",
    });
    expect(repositoryMocks.confirmEnrollment).not.toHaveBeenCalled();
  });

  it("precomputes session material before committing enrollment", async () => {
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );

    expect(sessionMocks.prepareSessionCookie).toHaveBeenCalledWith({
      uid: "admin-1",
      role: UserRole.ADMIN,
      email: "admin@example.com",
      fullName: "Admin One",
      mfaVerified: true,
      authMethod: "password",
    });
    expect(sessionMocks.prepareSessionCookie.mock.invocationCallOrder[0]).toBeLessThan(
      repositoryMocks.confirmEnrollment.mock.invocationCallOrder[0],
    );
    expect(sessionMocks.createHandoffCapability).toHaveBeenCalledWith({
      uid: "admin-1",
      backupCodeHashes: hashedCodes,
    });
    expect(sessionMocks.createHandoffCapability.mock.invocationCallOrder[0]).toBeLessThan(
      repositoryMocks.confirmEnrollment.mock.invocationCallOrder[0],
    );
    expect(repositoryMocks.confirmEnrollment).toHaveBeenCalledWith({
      userId: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      expectedSecret: "JBSWY3DPEHPK3PXP",
      backupCodeHashes: hashedCodes,
    });
    expect(sessionMocks.replaceAuthCookieFamily).toHaveBeenCalledWith(preparedSession);
    expect(result).toEqual({
      phase: "complete",
      success: true,
      message: "Two-factor authentication is enabled. Save these backup codes now.",
      backupCodes: plainCodes,
      continueHref: "/admin/classes",
    });
  });

  it("does not commit when fallible session preparation fails", async () => {
    sessionMocks.prepareSessionCookie.mockRejectedValueOnce(
      new Error("sensitive session signing failure"),
    );
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );

    expect(result).toMatchObject({ phase: "error", success: false });
    expect(repositoryMocks.confirmEnrollment).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("returns restart-required when rotation wins during the confirmation transaction", async () => {
    repositoryMocks.confirmEnrollment.mockRejectedValueOnce(
      new repositoryMocks.InitialAdminTwoFactorEnrollmentError("SECRET_CHANGED"),
    );
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );

    expect(result).toEqual({
      phase: "restart-required",
      success: false,
      message: "Your two-factor setup changed. Start setup again.",
    });
    expect(sessionMocks.replaceAuthCookieFamily).not.toHaveBeenCalled();
  });

  it("reports a committed enrollment as handoff-required when response-cookie work fails", async () => {
    sessionMocks.replaceAuthCookieFamily.mockRejectedValueOnce(
      new Error("sensitive response cookie failure"),
    );
    const { confirmInitialTwoFactorSetupAction } = await loadActions();

    const result = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );

    expect(repositoryMocks.confirmEnrollment).toHaveBeenCalledOnce();
    expect(result).toEqual({
      phase: "handoff-required",
      success: true,
      message:
        "Two-factor authentication is enabled, but secure sign-in and backup-code delivery still need to be completed.",
      handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
    });
    expect(JSON.stringify(result)).not.toMatch(/PLAIN-1|[0-9]{32}:[0-9]{128}|sensitive/);
  });

  it("recovers a committed handoff by rotating fresh hashes before revealing new codes", async () => {
    const { recoverInitialTwoFactorHandoffAction } = await loadActions();

    const result = await recoverInitialTwoFactorHandoffAction(
      {
        phase: "handoff-required",
        success: true,
        message: "Recovery required.",
        handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
      },
      handoffForm(),
    );

    expect(repositoryMocks.getHandoff).toHaveBeenCalledWith({
      userId: "admin-1",
      expectedBackupCodeHashFingerprint: committedHashFingerprint,
    });
    expect(repositoryMocks.recoverHandoff).toHaveBeenCalledWith({
      userId: "admin-1",
      expectedBackupCodeHashFingerprint: committedHashFingerprint,
      backupCodeHashes: hashedCodes,
    });
    expect(sessionMocks.getInitialSetupSession).not.toHaveBeenCalled();
    expect(sessionMocks.replaceAuthCookieFamily).toHaveBeenCalledWith(preparedSession);
    expect(result).toMatchObject({
      phase: "complete",
      success: true,
      backupCodes: plainCodes,
      continueHref: "/admin/classes",
    });
  });

  it("keeps recovery explicit and retryable when its cookie replacement also fails", async () => {
    sessionMocks.replaceAuthCookieFamily.mockRejectedValueOnce(new Error("cookie failure"));
    const { recoverInitialTwoFactorHandoffAction } = await loadActions();

    const result = await recoverInitialTwoFactorHandoffAction(
      {
        phase: "handoff-required",
        success: true,
        message: "Recovery required.",
        handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
      },
      handoffForm(),
    );

    expect(repositoryMocks.recoverHandoff).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      phase: "handoff-required",
      success: true,
      handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
    });
    expect(JSON.stringify(result)).not.toMatch(/PLAIN-1|cookie failure/);
  });

  it("recovers a delivered handoff after the original setup session expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T10:14:59.000Z"));
    const rotatedPlainCodes = Array.from({ length: 8 }, (_, index) => `ROTATED-${index + 1}`);
    const rotatedHashes = Array.from(
      { length: 8 },
      (_, index) => `${(index + 2).toString().repeat(32)}:${(index + 2).toString().repeat(128)}`,
    );
    sessionMocks.getInitialSetupSession.mockResolvedValueOnce(
      setupSession({ exp: Date.now() + 1_000 }),
    );
    sessionMocks.createHandoffCapability
      .mockResolvedValueOnce("SIGNED-HANDOFF-CAPABILITY")
      .mockResolvedValueOnce("SIGNED-NEXT-HANDOFF-CAPABILITY");
    sessionMocks.replaceAuthCookieFamily
      .mockRejectedValueOnce(new Error("cookie write failed"))
      .mockResolvedValueOnce(undefined);
    generateBackupCodesMock
      .mockResolvedValueOnce({ plain: plainCodes, hashed: hashedCodes })
      .mockResolvedValueOnce({ plain: rotatedPlainCodes, hashed: rotatedHashes });
    const { confirmInitialTwoFactorSetupAction, recoverInitialTwoFactorHandoffAction } =
      await loadActions();

    const committed = await confirmInitialTwoFactorSetupAction(
      { phase: "idle", success: false, message: "" },
      confirmationForm(),
    );
    vi.advanceTimersByTime(2_000);
    sessionMocks.getInitialSetupSession.mockResolvedValue(null);
    const recovered = await recoverInitialTwoFactorHandoffAction(
      committed,
      handoffForm("SIGNED-HANDOFF-CAPABILITY"),
    );

    expect(committed).toMatchObject({
      phase: "handoff-required",
      handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
    });
    expect(recovered).toMatchObject({
      phase: "complete",
      backupCodes: rotatedPlainCodes,
    });
    expect(sessionMocks.getInitialSetupSession).toHaveBeenCalledTimes(1);
  });

  it("bounds malformed, expired, and wrong-state handoff capability failures", async () => {
    sessionMocks.readHandoffCapability.mockResolvedValueOnce(null);
    const { recoverInitialTwoFactorHandoffAction } = await loadActions();
    const opaqueCapability = "SIGNED-BUT-EXPIRED-HANDOFF";

    const malformed = await recoverInitialTwoFactorHandoffAction(
      {
        phase: "handoff-required",
        success: true,
        message: "Recovery required.",
        handoffCapability: opaqueCapability,
      },
      handoffForm(opaqueCapability),
    );

    expect(malformed).toMatchObject({ phase: "error", success: false });
    expect(malformed.message).not.toContain(opaqueCapability);
    expect(repositoryMocks.getHandoff).not.toHaveBeenCalled();
    expect(sessionMocks.getInitialSetupSession).not.toHaveBeenCalled();

    sessionMocks.readHandoffCapability.mockResolvedValueOnce({
      purpose: "INITIAL_2FA_HANDOFF",
      uid: "other-admin",
      backupCodeHashFingerprint: "e".repeat(64),
      iat: Date.now(),
      exp: Date.now() + 60_000,
    });
    repositoryMocks.getHandoff.mockRejectedValueOnce(
      new repositoryMocks.InitialAdminTwoFactorEnrollmentError("HANDOFF_CHANGED"),
    );
    const wrongState = await recoverInitialTwoFactorHandoffAction(
      {
        phase: "handoff-required",
        success: true,
        message: "Recovery required.",
        handoffCapability: "WRONG-STATE-CAPABILITY",
      },
      handoffForm("WRONG-STATE-CAPABILITY"),
    );

    expect(wrongState).toMatchObject({ phase: "error", success: false });
    expect(wrongState.message).not.toContain("WRONG-STATE-CAPABILITY");
    expect(repositoryMocks.recoverHandoff).not.toHaveBeenCalled();
  });
});
