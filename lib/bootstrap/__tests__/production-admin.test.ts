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

function bootstrapWinner(overrides: Partial<BootstrapUser> = {}): BootstrapUser {
  return adminUser({
    fullName: "Bootstrap Admin",
    mustChangePassword: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorBackupCodes: [],
    ...overrides,
  });
}

function bootstrapAudit(targetId: string, overrides: Record<string, unknown> = {}) {
  return {
    adminUserId: null,
    actorId: "system:production-bootstrap",
    actorEmail: null,
    actorFullName: null,
    actorRole: "SYSTEM",
    action: "PRODUCTION_ADMIN_BOOTSTRAPPED",
    targetType: "AppUser",
    targetId,
    before: null,
    after: null,
    meta: { source: "production-bootstrap" },
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

function mailboxAddress(length: 254 | 255) {
  const address = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(
    length === 254 ? 61 : 62,
  )}`;
  expect(address).toHaveLength(length);
  return address;
}

function createDatabase() {
  const transaction = {
    appUser: {
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    adminAuditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  const database = {
    appUser: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    adminAuditLog: {
      findFirst: vi.fn(),
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

  it.each([
    ["null", null],
    ["an array", []],
    ["a primitive", "BOOTSTRAP_ADMIN_EMAIL=admin@example.com"],
    ["a null field", { BOOTSTRAP_ADMIN_EMAIL: null }],
    ["a non-string field", { BOOTSTRAP_ADMIN_PASSWORD: 123456789012 }],
  ])(
    "rejects %s environment input before hashing or database work",
    async (_label, environment) => {
      const { database } = createDatabase();

      await expect(bootstrapProductionAdmin(environment, database)).rejects.toMatchObject({
        name: "ProductionAdminBootstrapError",
        message: "Production admin bootstrap failed",
      });

      expect(database.appUser.count).not.toHaveBeenCalled();
      expect(database.appUser.findUnique).not.toHaveBeenCalled();
      expect(database.$transaction).not.toHaveBeenCalled();
      expect(hashPasswordMock).not.toHaveBeenCalled();
    },
  );

  it("sanitizes a sensitive database error at the public boundary", async () => {
    const { database } = createDatabase();
    const password = "BootstrapPassword123!";
    const hash = "sensitive-password-hash";
    database.appUser.count.mockRejectedValue(
      new Error(`database failed for ${password} with ${hash}`),
    );

    const error = await bootstrapProductionAdmin(
      configuredEnv({ BOOTSTRAP_ADMIN_PASSWORD: password }),
      database,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProductionAdminBootstrapError);
    expect(error).toMatchObject({ message: "Production admin bootstrap failed" });
    expect(JSON.stringify(error)).not.toContain(password);
    expect(JSON.stringify(error)).not.toContain(hash);
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("sanitizes a sensitive password-hashing error at the public boundary", async () => {
    const { database } = createDatabase();
    const password = "BootstrapPassword123!";
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    hashPasswordMock.mockRejectedValue(new Error(`hash failed for ${password}`));

    const error = await bootstrapProductionAdmin(
      configuredEnv({ BOOTSTRAP_ADMIN_PASSWORD: password }),
      database,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProductionAdminBootstrapError);
    expect(error).toMatchObject({ message: "Production admin bootstrap failed" });
    expect(JSON.stringify(error)).not.toContain(password);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("succeeds without bootstrap variables when an active admin exists", async () => {
    const { database, transaction } = createDatabase();
    database.appUser.count.mockResolvedValue(1);

    await expect(bootstrapProductionAdmin({}, database)).resolves.toEqual({ status: "existing" });

    expect(database.appUser.count).toHaveBeenCalledWith({
      where: { role: UserRole.ADMIN, isActive: true },
    });
    expect(database.appUser.findUnique).not.toHaveBeenCalled();
    expect(database.adminAuditLog.findFirst).not.toHaveBeenCalled();
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
    [254, true],
    [255, false],
  ] as const)(
    "accepts 254 and rejects 255 bootstrap mailbox characters before writes: %i / %s",
    async (length, accepted) => {
      const email = mailboxAddress(length);
      const { database, transaction } = createDatabase();

      if (accepted) {
        database.appUser.count.mockResolvedValue(0);
        database.appUser.findUnique.mockResolvedValue(null);
        transaction.appUser.findUnique.mockResolvedValue(null);
        transaction.appUser.count.mockResolvedValue(0);
        transaction.appUser.create.mockResolvedValue({ id: "admin-1", email });
        transaction.adminAuditLog.create.mockResolvedValue({ id: "audit-1" });

        await expect(
          bootstrapProductionAdmin(configuredEnv({ BOOTSTRAP_ADMIN_EMAIL: email }), database),
        ).resolves.toEqual({ status: "created", user: { id: "admin-1", email } });
        expect(transaction.appUser.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ email }) }),
        );
        return;
      }

      await expect(
        bootstrapProductionAdmin(configuredEnv({ BOOTSTRAP_ADMIN_EMAIL: email }), database),
      ).rejects.toBeInstanceOf(ProductionAdminBootstrapError);
      expect(database.appUser.count).not.toHaveBeenCalled();
      expect(hashPasswordMock).not.toHaveBeenCalled();
      expect(database.$transaction).not.toHaveBeenCalled();
      expect(transaction.appUser.create).not.toHaveBeenCalled();
    },
  );

  it.each([
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
    const created = bootstrapWinner({ id: "admin-race" });
    let createAttempts = 0;
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(created);
    database.adminAuditLog.findFirst.mockResolvedValue(bootstrapAudit(created.id));
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
    expect(database.adminAuditLog.findFirst).toHaveBeenCalledOnce();
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
    const racedAdmin = bootstrapWinner();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedAdmin);
    database.adminAuditLog.findFirst.mockResolvedValue(bootstrapAudit(racedAdmin.id));
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(1);

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(transaction.appUser.create).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
    expect(database.adminAuditLog.findFirst).toHaveBeenCalledOnce();
  });

  it("accepts an in-transaction winner only with exact initial state and bootstrap audit", async () => {
    const { database, transaction } = createDatabase();
    const racedAdmin = bootstrapWinner();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.findUnique.mockResolvedValue(racedAdmin);
    transaction.adminAuditLog.findFirst.mockResolvedValue(bootstrapAudit(racedAdmin.id));

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(transaction.appUser.create).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.findFirst).toHaveBeenCalledOnce();
  });

  it.each([
    ["full name", { fullName: "Unrelated Admin" }],
    ["password-change state", { mustChangePassword: false }],
    ["2FA enabled state", { twoFactorEnabled: true }],
    ["2FA secret", { twoFactorSecret: "unrelated-secret" }],
    ["backup hashes", { twoFactorBackupCodes: ["unrelated-backup-hash"] }],
    ["activation", { isActive: false }],
  ])("rejects a post-miss winner with mismatched %s", async (_label, userOverride) => {
    const { database, transaction } = createDatabase();
    const racedAdmin = bootstrapWinner(userOverride);
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedAdmin);
    database.adminAuditLog.findFirst.mockResolvedValue(bootstrapAudit(racedAdmin.id));
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(0);
    transaction.appUser.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["email"] },
    });

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing audit", null],
    ["a user actor", bootstrapAudit("admin-1", { actorId: "admin-1" })],
    ["unsanitized metadata", bootstrapAudit("admin-1", { meta: { source: "other" } })],
  ])("rejects a post-miss winner with %s", async (_label, audit) => {
    const { database, transaction } = createDatabase();
    const racedAdmin = bootstrapWinner();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedAdmin);
    database.adminAuditLog.findFirst.mockResolvedValue(audit);
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(0);
    transaction.appUser.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["email"] },
    });

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).rejects.toBeInstanceOf(
      ProductionAdminBootstrapError,
    );

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("recovers a serializable conflict only when the configured active admin wins", async () => {
    const { database, transaction } = createDatabase();
    const racedAdmin = bootstrapWinner();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedAdmin);
    database.adminAuditLog.findFirst.mockResolvedValue(bootstrapAudit(racedAdmin.id));
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(0);
    transaction.appUser.create.mockRejectedValue({ code: "P2034" });

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("retries after a commit-time serializable conflict before the winner is visible", async () => {
    const { database } = createDatabase();
    const racedAdmin = bootstrapWinner();
    database.appUser.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    database.appUser.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedAdmin);
    database.$transaction.mockRejectedValueOnce({ code: "P2034" });

    await expect(bootstrapProductionAdmin(configuredEnv(), database)).resolves.toEqual({
      status: "existing",
    });

    expect(database.appUser.count).toHaveBeenCalledTimes(2);
    expect(database.appUser.findUnique).toHaveBeenCalledTimes(3);
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(hashPasswordMock).toHaveBeenCalledOnce();
  });

  it("does not convert an unrelated P2034 into success for a same-email admin", async () => {
    const { database, transaction } = createDatabase();
    const conflict = { code: "P2034", message: "sensitive database detail" };
    const unrelatedAdmin = bootstrapWinner();
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(unrelatedAdmin);
    database.adminAuditLog.findFirst.mockResolvedValue(null);
    transaction.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.count.mockResolvedValue(0);
    transaction.appUser.create.mockRejectedValue(conflict);

    const error = await bootstrapProductionAdmin(configuredEnv(), database).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ProductionAdminBootstrapError);
    expect(error).not.toBe(conflict);
    expect(JSON.stringify(error)).not.toContain("sensitive database detail");
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

    const error = await bootstrapProductionAdmin(configuredEnv(), database).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ProductionAdminBootstrapError);
    expect(error).not.toBe(conflict);

    expect(database.$transaction).toHaveBeenCalledTimes(3);
    expect(hashPasswordMock).toHaveBeenCalledTimes(3);
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("rethrows unrelated Prisma failures instead of treating them as a race", async () => {
    const { database, transaction } = createDatabase();
    const failure = {
      code: "P1001",
      message: "database unavailable for BootstrapPassword123! sensitive-password-hash",
    };
    database.appUser.count.mockResolvedValue(0);
    database.appUser.findUnique.mockResolvedValue(null);
    transaction.appUser.create.mockRejectedValue(failure);

    const error = await bootstrapProductionAdmin(configuredEnv(), database).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ProductionAdminBootstrapError);
    expect(error).not.toBe(failure);
    expect(JSON.stringify(error)).not.toContain("BootstrapPassword123!");
    expect(JSON.stringify(error)).not.toContain("sensitive-password-hash");

    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
