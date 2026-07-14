import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUserForInitialSetupMock = vi.hoisted(() => vi.fn());
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const transactionUserFindMock = vi.hoisted(() => vi.fn());
const appUserUpdateMock = vi.hoisted(() => vi.fn());
const transactionClient = vi.hoisted(() => ({
  appUser: {
    findUnique: transactionUserFindMock,
    update: appUserUpdateMock,
  },
}));
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserForInitialSetup: findUserForInitialSetupMock,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

type AccountSetupRepository = typeof import("@/lib/repositories/account-setup-repository");

function loadRepository() {
  return import("@/lib/repositories/account-setup-repository") as Promise<AccountSetupRepository>;
}

function setupUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "student-1",
    email: "student@example.com",
    fullName: "Student One",
    role: UserRole.STUDENT,
    passwordHash: "old-hash",
    mustChangePassword: true,
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: "server-only-secret",
    twoFactorBackupCodes: ["server-only-backup-hash"],
    ...overrides,
  };
}

describe("changeInitialPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const user = setupUser();
    findUserForInitialSetupMock.mockResolvedValue(user);
    transactionUserFindMock.mockResolvedValue(user);
    verifyPasswordMock.mockImplementation(
      async (password: string) => password === "CurrentPass123!",
    );
    hashPasswordMock.mockResolvedValue("new-hash");
    appUserUpdateMock.mockResolvedValue({ id: "student-1" });
    createAdminAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient),
    );
  });

  it.each([
    ["a missing user", null],
    ["an inactive user", setupUser({ isActive: false })],
    ["a completed setup", setupUser({ mustChangePassword: false })],
  ])("rejects %s before password work or audit", async (_label, user) => {
    findUserForInitialSetupMock.mockResolvedValueOnce(user);
    const { changeInitialPassword } = await loadRepository();

    await expect(
      changeInitialPassword("student-1", "CurrentPass123!", "NewPassword123!"),
    ).rejects.toMatchObject({ code: "INVALID_SETUP" });

    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong current password without updating or auditing", async () => {
    verifyPasswordMock.mockResolvedValueOnce(false);
    const { changeInitialPassword } = await loadRepository();

    await expect(
      changeInitialPassword("student-1", "WrongPassword123!", "NewPassword123!"),
    ).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD" });

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects password reuse without updating or auditing", async () => {
    verifyPasswordMock.mockResolvedValue(true);
    const { changeInitialPassword } = await loadRepository();

    await expect(
      changeInitialPassword("student-1", "CurrentPass123!", "CurrentPass123!"),
    ).rejects.toMatchObject({ code: "PASSWORD_REUSE" });

    expect(verifyPasswordMock).toHaveBeenNthCalledWith(1, "CurrentPass123!", "old-hash");
    expect(verifyPasswordMock).toHaveBeenNthCalledWith(2, "CurrentPass123!", "old-hash");
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("updates and writes a sanitized success audit in the same transaction", async () => {
    verifyPasswordMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { changeInitialPassword } = await loadRepository();

    const result = await changeInitialPassword("student-1", "CurrentPass123!", "NewPassword123!");

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(appUserUpdateMock).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: {
        passwordHash: "new-hash",
        mustChangePassword: false,
      },
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "student-1",
        action: "INITIAL_PASSWORD_CHANGED",
        targetType: "AUTH",
        targetId: "student-1",
        before: { mustChangePassword: true },
        after: { mustChangePassword: false },
      }),
      transactionClient,
    );
    expect(result).toEqual({
      id: "student-1",
      email: "student@example.com",
      fullName: "Student One",
      role: UserRole.STUDENT,
      twoFactorEnabled: false,
    });
    expect(Object.keys(result).sort()).toEqual(
      ["email", "fullName", "id", "role", "twoFactorEnabled"].sort(),
    );

    const serializedAudit = JSON.stringify(createAdminAuditLogMock.mock.calls[0]);
    expect(serializedAudit).not.toContain("CurrentPass123!");
    expect(serializedAudit).not.toContain("NewPassword123!");
    expect(serializedAudit).not.toContain("old-hash");
    expect(serializedAudit).not.toContain("new-hash");
    expect(serializedAudit).not.toContain("server-only-secret");
    expect(serializedAudit).not.toContain("server-only-backup-hash");
  });

  it("rejects stale setup state found inside the transaction", async () => {
    verifyPasswordMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    transactionUserFindMock.mockResolvedValueOnce(setupUser({ mustChangePassword: false }));
    const { changeInitialPassword } = await loadRepository();

    await expect(
      changeInitialPassword("student-1", "CurrentPass123!", "NewPassword123!"),
    ).rejects.toMatchObject({ code: "INVALID_SETUP" });

    expect(appUserUpdateMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects a password hash changed by a competing mutation", async () => {
    verifyPasswordMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    transactionUserFindMock.mockResolvedValueOnce(setupUser({ passwordHash: "raced-hash" }));
    const { changeInitialPassword } = await loadRepository();

    await expect(
      changeInitialPassword("student-1", "CurrentPass123!", "NewPassword123!"),
    ).rejects.toMatchObject({ code: "INVALID_SETUP" });

    expect(appUserUpdateMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("lets an audit failure abort the transaction instead of reporting success", async () => {
    verifyPasswordMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    createAdminAuditLogMock.mockRejectedValueOnce(new Error("audit unavailable"));
    const { changeInitialPassword } = await loadRepository();

    await expect(
      changeInitialPassword("student-1", "CurrentPass123!", "NewPassword123!"),
    ).rejects.toThrow("audit unavailable");

    expect(appUserUpdateMock).toHaveBeenCalledOnce();
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(expect.anything(), transactionClient);
    expect(transactionMock).toHaveBeenCalledOnce();
  });
});
