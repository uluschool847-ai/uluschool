import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createUserMock = vi.hoisted(() => vi.fn());
const updateUserRoleMock = vi.hoisted(() => vi.fn());
const toggleUserStatusMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClientMock),
  ),
}));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  createUser: createUserMock,
  updateUserRole: updateUserRoleMock,
  toggleUserStatus: toggleUserStatusMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type UsersActionsModule = {
  createUserAction: (input: unknown) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
  updateUserRoleAction: (input: unknown) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
  toggleUserStatusAction: (input: unknown) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
};

async function loadUsersActions() {
  const specifier = "@/app/(admin)/admin/users/actions";
  return import(/* @vite-ignore */ specifier) as Promise<UsersActionsModule>;
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectAppUserAuditTarget(action: string, userId = "user-1") {
  expect(auditPayloadFor(action)).toEqual(
    expect.objectContaining({
      adminUserId: "admin-1",
      action,
      targetType: "app_user",
      targetId: userId,
      meta: expect.objectContaining({
        actorRole: "ADMIN",
        appUserId: userId,
      }),
    }),
  );
}

function expectNoSensitiveAuditData(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toMatch(/password/i);
  expect(serialized).not.toMatch(/passwordHash/i);
  expect(serialized).not.toMatch(/resetToken/i);
  expect(serialized).not.toMatch(/sessionToken/i);
  expect(serialized).not.toMatch(/ChangeMe123!/i);
  expect(serialized).not.toMatch(/\$2[aby]\$/i);
}

describe("Admin user management actions audit coverage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  it("returns only the safe AppUser snapshot and one-time credential fields", async () => {
    createUserMock.mockResolvedValueOnce({
      user: {
        id: "user-1",
        email: "teacher.portal@example.com",
        fullName: "Teacher Portal",
        role: UserRole.TEACHER,
        isActive: true,
        passwordHash: "$2b$10$secret-hash-that-must-not-be-audited",
        phoneWhatsapp: "+254700000000",
        mustChangePassword: true,
        learningStatus: null,
        twoFactorEnabled: true,
        twoFactorSecret: "sensitive-totp-secret",
        twoFactorBackupCodes: ["sensitive-backup-code"],
        createdAt: new Date("2026-07-13T10:00:00.000Z"),
        updatedAt: new Date("2026-07-13T10:00:00.000Z"),
      },
      temporaryPassword: "UniqueTemporary123_A",
      mustChangePassword: true,
    });

    const { createUserAction } = await loadUsersActions();
    const result = await createUserAction({
      email: "teacher.portal@example.com",
      fullName: "Teacher Portal",
      role: "TEACHER",
      phoneWhatsapp: "+254700000000",
    });

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(createUserMock).toHaveBeenCalledWith(
      {
        email: "teacher.portal@example.com",
        fullName: "Teacher Portal",
        role: UserRole.TEACHER,
        phoneWhatsapp: "+254700000000",
      },
      transactionClientMock,
    );
    expect(result).toEqual({
      success: true,
      data: {
        user: {
          id: "user-1",
          email: "teacher.portal@example.com",
          fullName: "Teacher Portal",
          role: UserRole.TEACHER,
          isActive: true,
        },
        temporaryPassword: "UniqueTemporary123_A",
        mustChangePassword: true,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|twoFactorSecret|twoFactorBackupCodes|sensitive-totp-secret|sensitive-backup-code/i,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
    expectAppUserAuditTarget("APP_USER_CREATED");
    expect(auditPayloadFor("APP_USER_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({
          id: "user-1",
          email: "teacher.portal@example.com",
          role: UserRole.TEACHER,
        }),
      }),
    );
    expectNoSensitiveAuditData(auditPayloadFor("APP_USER_CREATED"));
    expect(JSON.stringify(auditPayloadFor("APP_USER_CREATED"))).not.toContain(
      "UniqueTemporary123_A",
    );
  });

  it("writes an audit log when changing an AppUser role", async () => {
    updateUserRoleMock.mockResolvedValueOnce({
      id: "user-1",
      email: "teacher.portal@example.com",
      before: { id: "user-1", role: UserRole.TEACHER },
      after: { id: "user-1", role: UserRole.ADMIN },
    });

    const { updateUserRoleAction } = await loadUsersActions();
    const result = await updateUserRoleAction({
      userId: "user-1",
      role: "ADMIN",
    });

    expect(updateUserRoleMock).toHaveBeenCalledWith(
      "user-1",
      UserRole.ADMIN,
      "admin-1",
      transactionClientMock,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
    expectAppUserAuditTarget("APP_USER_ROLE_UPDATED");
    expect(auditPayloadFor("APP_USER_ROLE_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ role: UserRole.TEACHER }),
        after: expect.objectContaining({ role: UserRole.ADMIN }),
      }),
    );
    expectNoSensitiveAuditData(auditPayloadFor("APP_USER_ROLE_UPDATED"));
  });

  it("writes an audit log when activating or deactivating an AppUser", async () => {
    toggleUserStatusMock.mockResolvedValueOnce({
      id: "user-1",
      email: "teacher.portal@example.com",
      before: { id: "user-1", isActive: true },
      after: { id: "user-1", isActive: false },
    });

    const { toggleUserStatusAction } = await loadUsersActions();
    const result = await toggleUserStatusAction({
      userId: "user-1",
      isActive: false,
    });

    expect(toggleUserStatusMock).toHaveBeenCalledWith(
      "user-1",
      false,
      "admin-1",
      transactionClientMock,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
    expectAppUserAuditTarget("APP_USER_STATUS_UPDATED");
    expect(auditPayloadFor("APP_USER_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ isActive: true }),
        after: expect.objectContaining({ isActive: false }),
      }),
    );
    expectNoSensitiveAuditData(auditPayloadFor("APP_USER_STATUS_UPDATED"));
  });

  it.each([
    {
      name: "invalid email",
      input: { email: "not-an-email", fullName: "Teacher Portal", role: "TEACHER" },
    },
    {
      name: "empty full name",
      input: { email: "teacher.portal@example.com", fullName: "", role: "TEACHER" },
    },
    {
      name: "invalid role",
      input: { email: "teacher.portal@example.com", fullName: "Teacher Portal", role: "OWNER" },
    },
  ])("rejects create input with $name after admin authorization", async ({ input }) => {
    const { createUserAction } = await loadUsersActions();
    const result = await createUserAction(input);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Invalid input." });
  });

  it.each([
    { name: "empty user ID", input: { userId: "", role: "ADMIN" } },
    { name: "invalid role", input: { userId: "user-1", role: "OWNER" } },
  ])("rejects role update with $name after admin authorization", async ({ input }) => {
    const { updateUserRoleAction } = await loadUsersActions();
    const result = await updateUserRoleAction(input);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(updateUserRoleMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Invalid input." });
  });

  it.each([
    { name: "empty user ID", input: { userId: "", isActive: true } },
    { name: "non-boolean status", input: { userId: "user-1", isActive: "false" } },
  ])("rejects status update with $name after admin authorization", async ({ input }) => {
    const { toggleUserStatusAction } = await loadUsersActions();
    const result = await toggleUserStatusAction(input);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(toggleUserStatusMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: "Invalid input." });
  });

  it("does not write audit logs when user creation mutation fails", async () => {
    createUserMock.mockRejectedValueOnce(new Error("A user with this email already exists."));

    const { createUserAction } = await loadUsersActions();
    const result = await createUserAction({
      email: "teacher.portal@example.com",
      fullName: "Teacher Portal",
      role: "TEACHER",
    });

    expect(createUserMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/already exists/i),
      }),
    );
  });

  it("does not write audit logs when role mutation fails", async () => {
    updateUserRoleMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updateUserRoleAction } = await loadUsersActions();
    const result = await updateUserRoleAction({
      userId: "user-1",
      role: "TEACHER",
    });

    expect(updateUserRoleMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/database unavailable/i),
      }),
    );
  });

  it("does not write audit logs when status mutation fails", async () => {
    toggleUserStatusMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { toggleUserStatusAction } = await loadUsersActions();
    const result = await toggleUserStatusAction({
      userId: "user-1",
      isActive: false,
    });

    expect(toggleUserStatusMock).toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/database unavailable/i),
      }),
    );
  });
});
