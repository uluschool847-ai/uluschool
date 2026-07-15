import { Prisma, UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const challengeFindFirstMock = vi.hoisted(() => vi.fn());
const challengeUpdateManyMock = vi.hoisted(() => vi.fn());
const challengeCreateMock = vi.hoisted(() => vi.fn());
const appUserFindFirstMock = vi.hoisted(() => vi.fn());
const appUserUpdateMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const verifyTotpCodeMock = vi.hoisted(() => vi.fn());
const consumeBackupCodeMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const transactionClient = vi.hoisted(() => ({
  adminTwoFactorChallenge: {
    findFirst: challengeFindFirstMock,
    updateMany: challengeUpdateManyMock,
    create: challengeCreateMock,
  },
  appUser: {
    findFirst: appUserFindFirstMock,
    update: appUserUpdateMock,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/auth/two-factor", () => ({
  verifyTotpCode: verifyTotpCodeMock,
  consumeBackupCode: consumeBackupCodeMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

function loadRepository() {
  return import("@/lib/repositories/admin-two-factor-challenge-repository");
}

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge-1",
    userId: "admin-1",
    authMethod: "password",
    failedAttempts: 0,
    expiresAt: new Date("2030-01-01T00:10:00.000Z"),
    consumedAt: null,
    ...overrides,
  };
}

function enabledAdmin(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Admin One",
    role: UserRole.ADMIN,
    isActive: true,
    mustChangePassword: false,
    twoFactorEnabled: true,
    twoFactorSecret: "JBSWY3DPEHPK3PXP",
    twoFactorBackupCodes: ["backup-hash"],
    ...overrides,
  };
}

describe("admin two-factor challenge repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    challengeUpdateManyMock.mockResolvedValue({ count: 1 });
    challengeCreateMock.mockResolvedValue(challenge());
    challengeFindFirstMock.mockResolvedValue(challenge());
    appUserFindFirstMock.mockResolvedValue(enabledAdmin());
    appUserUpdateMock.mockResolvedValue({ id: "admin-1" });
    verifyTotpCodeMock.mockReturnValue(true);
    consumeBackupCodeMock.mockResolvedValue({ valid: true, remaining: [] });
    createAdminAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(
      async (callback: (transaction: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates prior active challenges before creating a fresh password challenge", async () => {
    const { startAdminTwoFactorChallenge } = await loadRepository();
    const expiresAt = new Date("2030-01-01T00:10:00.000Z");

    const result = await startAdminTwoFactorChallenge({
      userId: "admin-1",
      authMethod: "password",
      expiresAt,
    });

    expect(transactionMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
    expect(challengeUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "admin-1", consumedAt: null }),
      }),
    );
    expect(challengeCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        authMethod: "password",
        failedAttempts: 0,
        expiresAt,
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: "challenge-1", expiresAt }));
  });

  it("locks a challenge after five invalid TOTP submissions and rejects a sixth valid submission", async () => {
    const { completeAdminTwoFactorChallenge } = await loadRepository();
    verifyTotpCodeMock.mockReturnValue(false);
    challengeFindFirstMock
      .mockResolvedValueOnce(challenge({ failedAttempts: 0 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 1 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 2 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 3 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 4 }))
      .mockResolvedValueOnce(null);

    const results = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      results.push(
        await completeAdminTwoFactorChallenge({
          userId: "admin-1",
          challengeId: "challenge-1",
          authMethod: "password",
          verification: { type: "totp", code: "000000" },
        }),
      );
    }

    verifyTotpCodeMock.mockReturnValue(true);
    const sixth = await completeAdminTwoFactorChallenge({
      userId: "admin-1",
      challengeId: "challenge-1",
      authMethod: "password",
      verification: { type: "totp", code: "123456" },
    });

    expect(results).toEqual([
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: true },
    ]);
    expect(challengeUpdateManyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    expect(sixth).toEqual({ outcome: "rejected", reason: "CHALLENGE_UNAVAILABLE" });
    expect(verifyTotpCodeMock).toHaveBeenCalledTimes(5);
  });

  it("locks a challenge after five invalid backup-code submissions and rejects a sixth valid backup code", async () => {
    const { completeAdminTwoFactorChallenge } = await loadRepository();
    consumeBackupCodeMock.mockResolvedValue({ valid: false, remaining: ["backup-hash"] });
    challengeFindFirstMock
      .mockResolvedValueOnce(challenge({ failedAttempts: 0 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 1 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 2 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 3 }))
      .mockResolvedValueOnce(challenge({ failedAttempts: 4 }))
      .mockResolvedValueOnce(null);

    const results = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      results.push(
        await completeAdminTwoFactorChallenge({
          userId: "admin-1",
          challengeId: "challenge-1",
          authMethod: "password",
          verification: { type: "backup", code: "INVALID-BACKUP" },
        }),
      );
    }

    consumeBackupCodeMock.mockResolvedValue({ valid: true, remaining: [] });
    const sixth = await completeAdminTwoFactorChallenge({
      userId: "admin-1",
      challengeId: "challenge-1",
      authMethod: "password",
      verification: { type: "backup", code: "BACKUP-1" },
    });

    expect(results).toEqual([
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: false },
      { outcome: "failure", locked: true },
    ]);
    expect(sixth).toEqual({ outcome: "rejected", reason: "CHALLENGE_UNAVAILABLE" });
    expect(consumeBackupCodeMock).toHaveBeenCalledTimes(5);
  });

  it("rejects a pending cookie pointer when the user and challenge do not match", async () => {
    const { completeAdminTwoFactorChallenge } = await loadRepository();
    challengeFindFirstMock.mockResolvedValueOnce(null);

    const result = await completeAdminTwoFactorChallenge({
      userId: "admin-2",
      challengeId: "challenge-1",
      authMethod: "password",
      verification: { type: "totp", code: "123456" },
    });

    expect(result).toEqual({ outcome: "rejected", reason: "CHALLENGE_UNAVAILABLE" });
    expect(challengeFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "admin-2", id: "challenge-1" }),
      }),
    );
    expect(verifyTotpCodeMock).not.toHaveBeenCalled();
  });

  it("retries the complete serializable transaction after P2034 instead of reusing a stale backup-code read", async () => {
    const { completeAdminTwoFactorChallenge } = await loadRepository();
    const serializationFailure = Object.assign(new Error("serialization failure"), {
      code: "P2034",
    });
    transactionMock
      .mockRejectedValueOnce(serializationFailure)
      .mockImplementationOnce(
        async (callback: (transaction: typeof transactionClient) => unknown) =>
          callback(transactionClient),
      );

    const result = await completeAdminTwoFactorChallenge({
      userId: "admin-1",
      challengeId: "challenge-1",
      authMethod: "password",
      verification: { type: "backup", code: "BACKUP-1" },
    });

    expect(result).toEqual(expect.objectContaining({ outcome: "success" }));
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(consumeBackupCodeMock).toHaveBeenCalledWith({
      providedCode: "BACKUP-1",
      hashedCodes: ["backup-hash"],
    });
  });

  it("commits backup-code removal, challenge consumption, and both final-success audits in one transaction", async () => {
    const { completeAdminTwoFactorChallenge } = await loadRepository();

    const result = await completeAdminTwoFactorChallenge({
      userId: "admin-1",
      challengeId: "challenge-1",
      authMethod: "password",
      verification: { type: "backup", code: "BACKUP-1" },
      requestMetadata: { userAgent: "ULU-test-client" },
    });

    expect(result).toEqual(
      expect.objectContaining({
        outcome: "success",
        user: expect.objectContaining({ id: "admin-1", role: UserRole.ADMIN }),
      }),
    );
    expect(appUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { twoFactorBackupCodes: [] },
    });
    expect(challengeUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "challenge-1", consumedAt: null }),
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ADMIN_LOGIN_2FA_BACKUP_SUCCESS" }),
      transactionClient,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCESS" }),
      transactionClient,
    );
    expect(JSON.stringify(createAdminAuditLogMock.mock.calls)).not.toContain("127.0.0.1");
  });
});
