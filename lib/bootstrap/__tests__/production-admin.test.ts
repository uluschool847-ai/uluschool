import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hashPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

import {
  ProductionAdminBootstrapError,
  bootstrapProductionAdmin,
} from "@/lib/bootstrap/production-admin";

type BootstrapUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorBackupCodes: string[];
};

function adminUser(overrides: Partial<BootstrapUser> = {}): BootstrapUser {
  return {
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Existing Admin",
    role: UserRole.ADMIN,
    isActive: true,
    passwordHash: "existing-password-hash",
    mustChangePassword: false,
    twoFactorEnabled: true,
    twoFactorSecret: "existing-two-factor-secret",
    twoFactorBackupCodes: ["existing-backup-code-hash"],
    ...overrides,
  };
}

function configuredEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    BOOTSTRAP_ADMIN_EMAIL: "Admin@Example.com",
    BOOTSTRAP_ADMIN_NAME: "Bootstrap Admin",
    BOOTSTRAP_ADMIN_PASSWORD: "BootstrapPassword123!",
    ...overrides,
  };
}

function createDatabase() {
  const transaction = {
    appUser: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    adminAuditLog: {
      create: vi.fn(),
    },
  };
  const database = {
    appUser: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };

  return { database, transaction };
}

describe("bootstrapProductionAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashPasswordMock.mockResolvedValue("new-password-hash");
  });

  it("succeeds without bootstrap variables when an active admin exists", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(1);

    await expect(bootstrapProductionAdmin({}, database)).resolves.toEqual({ status: "existing" });

    expect(database.appUser.count).toHaveBeenCalledWith({
      where: { role: UserRole.ADMIN, isActive: true },
    });
    expect(database.appUser.findUnique).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it("fails when no active admin and variables are missing", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);

    await expect(bootstrapProductionAdmin({}, database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("fails for a password shorter than 12 characters", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);

    await expect(
      bootstrapProductionAdmin(configuredEnv({ BOOTSTRAP_ADMIN_PASSWORD: "too-short" }), database),
    ).rejects.toBeInstanceOf(ProductionAdminBootstrapError);

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it("rejects partial configuration before hashing or database writes", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);

    await expect(
      bootstrapProductionAdmin(configuredEnv({ BOOTSTRAP_ADMIN_NAME: "   " }), database),
    ).rejects.toBeInstanceOf(ProductionAdminBootstrapError);

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.appUser.findUnique).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it.each([
    ["email", { BOOTSTRAP_ADMIN_EMAIL: `${"e".repeat(310)}@example.com` }],
    ["name", { BOOTSTRAP_ADMIN_NAME: "n".repeat(201) }],
    ["password", { BOOTSTRAP_ADMIN_PASSWORD: "p".repeat(257) }],
  ])("rejects an oversized %s before hashing", async (_field, override) => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);

    await expect(
      bootstrapProductionAdmin(configuredEnv(override), database),
    ).rejects.toBeInstanceOf(ProductionAdminBootstrapError);

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it("creates one admin with mustChangePassword true", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.create.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    transaction.adminAuditLog.create.mockResolvedValue({ id: "audit-1" });

    await expect(
      bootstrapProductionAdmin(
        configuredEnv({
          BOOTSTRAP_ADMIN_EMAIL: "  Admin@Example.com ",
          BOOTSTRAP_ADMIN_NAME: "  Bootstrap Admin  ",
        }),
        database,
      ),
    ).resolves.toEqual({
      status: "created",
      user: { id: "admin-1", email: "admin@example.com" },
    });

    expect(hashPasswordMock).toHaveBeenCalledWith("BootstrapPassword123!");
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transaction.appUser.create).toHaveBeenCalledWith({
      data: {
        email: "admin@example.com",
        fullName: "Bootstrap Admin",
        role: UserRole.ADMIN,
        passwordHash: "new-password-hash",
        mustChangePassword: true,
        isActive: true,
      },
      select: { id: true, email: true },
    });
    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: null,
        actorId: "system:production-bootstrap",
        actorEmail: null,
        actorFullName: null,
        actorRole: "SYSTEM",
        action: "PRODUCTION_ADMIN_BOOTSTRAPPED",
        targetType: "AppUser",
        targetId: "admin-1",
        meta: { source: "production-bootstrap" },
      },
    });
  });

  it("does not reset an existing admin password or 2FA", async () => {
    const { database, transaction } = createDatabase();
    const existing = adminUser();
    database.appUser.count.mockResolvedValue(1);
    database.appUser.findUnique.mockResolvedValue(existing);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(existing).toEqual(adminUser());
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("fails when the configured email belongs to a non-admin user", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(1);
    database.appUser.findUnique.mockResolvedValue(adminUser({ role: UserRole.TEACHER }));

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it("fails when the configured email belongs to an inactive admin", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(adminUser({ isActive: false }));

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it("fails when a different active admin already exists", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(1);
    database.appUser.findUnique.mockResolvedValue(null);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(transaction.appUser.create).not.toHaveBeenCalled();
  });

  it("never includes the password or hash in its result or audit", async () => {
    const { database, transaction } = createDatabase();
    const password = "BootstrapPassword123!";
    const hash = "sensitive-password-hash";
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue(hash);
    transaction.appUser.create.mockResolvedValue({ id: "admin-1", email: "admin@example.com" });
    transaction.adminAuditLog.create.mockResolvedValue({ id: "audit-1" });

    const result = await bootstrapProductionAdmin(
      configuredEnv({ BOOTSTRAP_ADMIN_PASSWORD: password }),
      database,
    );
    const serialized = JSON.stringify({
      result,
      audit: transaction.adminAuditLog.create.mock.calls,
    });

    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(hash);
  });

  it("converges concurrent same-email calls to one created admin and one audit", async () => {
    const { database, transaction } = createDatabase();
    const created = adminUser({ id: "admin-race", twoFactorEnabled: false, twoFactorSecret: null });
    let createAttempts = 0;
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(created);
    transaction.appUser.create.mockImplementation(async () => {
      createAttempts += 1;
      if (createAttempts === 1) return { id: created.id, email: created.email };
      throw { code: "P2002", meta: { target: ["email"] } };
    });
    transaction.adminAuditLog.create.mockResolvedValue({ id: "audit-race" });

    const results = await Promise.all([
      bootstrapProductionAdmin(configuredEnv(), database),
      bootstrapProductionAdmin(configuredEnv(), database),
    ]);

    expect(results).toEqual([
      { status: "created", user: { id: created.id, email: created.email } },
      { status: "existing" },
    ]);
    expect(transaction.appUser.create).toHaveBeenCalledTimes(2);
    expect(transaction.adminAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it("refuses to create when an active admin appears inside the write transaction", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(1);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(transaction.appUser.create).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("returns existing when the configured active admin appears during the write transaction", async () => {
    const { database, transaction } = createDatabase();
    const racedAdmin = adminUser();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedAdmin);
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(1);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(transaction.appUser.create).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("recovers a serializable conflict only when the configured active admin wins", async () => {
    const { database, transaction } = createDatabase();
    const racedAdmin = adminUser();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedAdmin);
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(0);
    transaction.appUser.create.mockRejectedValue({ code: "P2034" });

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("rethrows a serializable conflict without a matching active admin", async () => {
    const { database, transaction } = createDatabase();
    const conflict = { code: "P2034" };
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(0);
    transaction.appUser.create.mockRejectedValue(conflict);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBe(conflict);

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("rethrows unrelated Prisma failures instead of treating them as a race", async () => {
    const { database, transaction } = createDatabase();
    const failure = { code: "P1001", message: "database unavailable" };
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.create.mockRejectedValue(failure);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBe(failure);

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
