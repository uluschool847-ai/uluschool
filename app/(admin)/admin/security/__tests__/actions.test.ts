import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findAdminUserForTwoFactorMock = vi.hoisted(() => vi.fn());
const saveAdminTwoFactorSecretMock = vi.hoisted(() => vi.fn());
const enableAdminTwoFactorMock = vi.hoisted(() => vi.fn());
const disableAdminTwoFactorMock = vi.hoisted(() => vi.fn());
const generateTwoFactorSecretMock = vi.hoisted(() => vi.fn());
const getTotpUriMock = vi.hoisted(() => vi.fn());
const verifyTotpCodeMock = vi.hoisted(() => vi.fn());
const generateBackupCodesMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/auth/two-factor", () => ({
  generateTwoFactorSecret: generateTwoFactorSecretMock,
  getTotpUri: getTotpUriMock,
  verifyTotpCode: verifyTotpCodeMock,
  generateBackupCodes: generateBackupCodesMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findAdminUserForTwoFactor: findAdminUserForTwoFactorMock,
  saveAdminTwoFactorSecret: saveAdminTwoFactorSecretMock,
  enableAdminTwoFactor: enableAdminTwoFactorMock,
  disableAdminTwoFactor: disableAdminTwoFactorMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

async function loadActions() {
  const specifier = "@/app/(admin)/admin/security/actions";
  return import(/* @vite-ignore */ specifier) as Promise<{
    beginTwoFactorSetupAction: (state: unknown) => Promise<{
      success: boolean;
      message: string;
      setupSecret?: string;
      otpAuthUrl?: string;
    }>;
    confirmTwoFactorSetupAction: (
      state: unknown,
      formData: FormData,
    ) => Promise<{ success: boolean; message: string; backupCodes?: string[] }>;
    disableTwoFactorAction: () => Promise<{ success: boolean; message: string }>;
  }>;
}

describe("admin security 2FA actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    findAdminUserForTwoFactorMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      twoFactorEnabled: false,
      twoFactorSecret: "SECRET123",
      twoFactorBackupCodes: [],
    });
    generateTwoFactorSecretMock.mockReturnValue("NEWSECRET");
    getTotpUriMock.mockReturnValue("otpauth://demo");
    verifyTotpCodeMock.mockReturnValue(true);
    generateBackupCodesMock.mockResolvedValue({
      plain: ["PLAIN-CODE"],
      hashed: ["HASHED-CODE"],
    });
  });

  it("does not return an existing secret when setup is already enabled", async () => {
    findAdminUserForTwoFactorMock.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      twoFactorEnabled: true,
      twoFactorSecret: "EXISTINGSECRET",
      twoFactorBackupCodes: [],
    });

    const { beginTwoFactorSetupAction } = await loadActions();
    const result = await beginTwoFactorSetupAction({});

    expect(result).toEqual({
      success: false,
      message: "2FA is already enabled for this account.",
    });
    expect(saveAdminTwoFactorSecretMock).not.toHaveBeenCalled();
  });

  it("enables 2FA with audit before/after and without logging secrets", async () => {
    const formData = new FormData();
    formData.set("code", "123456");

    const { confirmTwoFactorSetupAction } = await loadActions();
    const result = await confirmTwoFactorSetupAction({}, formData);

    expect(result.success).toBe(true);
    expect(enableAdminTwoFactorMock).toHaveBeenCalledWith("admin-1", "SECRET123", ["HASHED-CODE"]);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      action: "ADMIN_2FA_ENABLED",
      targetType: "AppUser",
      targetId: "admin-1",
      before: { twoFactorEnabled: false },
      after: { twoFactorEnabled: true },
      meta: { actorRole: UserRole.ADMIN },
    });
    expect(JSON.stringify(createAdminAuditLogMock.mock.calls)).not.toMatch(
      /SECRET123|PLAIN-CODE|HASHED-CODE/,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/security");
  });

  it("rejects invalid confirmation codes without enabling 2FA", async () => {
    verifyTotpCodeMock.mockReturnValueOnce(false);
    const formData = new FormData();
    formData.set("code", "000000");

    const { confirmTwoFactorSetupAction } = await loadActions();
    const result = await confirmTwoFactorSetupAction({}, formData);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid code/i);
    expect(enableAdminTwoFactorMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("disables 2FA with audit before/after", async () => {
    findAdminUserForTwoFactorMock.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      twoFactorEnabled: true,
      twoFactorSecret: "SECRET123",
      twoFactorBackupCodes: ["HASHED-CODE"],
    });

    const { disableTwoFactorAction } = await loadActions();
    const result = await disableTwoFactorAction();

    expect(result.success).toBe(true);
    expect(disableAdminTwoFactorMock).toHaveBeenCalledWith("admin-1");
    expect(createAdminAuditLogMock).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      action: "ADMIN_2FA_DISABLED",
      targetType: "AppUser",
      targetId: "admin-1",
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false },
      meta: { actorRole: UserRole.ADMIN },
    });
    expect(JSON.stringify(createAdminAuditLogMock.mock.calls)).not.toMatch(/SECRET123|HASHED-CODE/);
  });
});
