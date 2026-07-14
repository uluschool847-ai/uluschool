import {
  type ProductionAdminDatabase,
  bootstrapProductionAdmin,
} from "@/lib/bootstrap/production-admin";
import { prisma } from "@/lib/prisma";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const runPostgres = process.env.RUN_A8_POSTGRES_INTEGRATION === "1";
const suite = describe.skipIf(!runPostgres);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emails = new Set<string>();

function createEnvironment(label: string) {
  const email = `a8-${label}-${runId}@example.com`;
  emails.add(email);
  return {
    BOOTSTRAP_ADMIN_EMAIL: email,
    BOOTSTRAP_ADMIN_NAME: "A8 Production Bootstrap",
    BOOTSTRAP_ADMIN_PASSWORD: "A8-Production-Bootstrap-Password",
  };
}

function databaseWithoutExistingAdmins(): ProductionAdminDatabase {
  return {
    appUser: {
      count: async () => 0,
      findUnique: (args) => prisma.appUser.findUnique(args),
    },
    $transaction: (callback, options) =>
      prisma.$transaction(
        (transaction) =>
          callback({
            appUser: {
              count: async () => 0,
              findUnique: (args) => transaction.appUser.findUnique(args),
              create: (args) => transaction.appUser.create(args),
            },
            adminAuditLog: {
              create: (args) => transaction.adminAuditLog.create(args),
            },
          }),
        options,
      ),
  };
}

suite("production admin bootstrap PostgreSQL", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (emails.size === 0) return;

    const users = await prisma.appUser.findMany({
      where: { email: { in: [...emails] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    if (userIds.length > 0) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: userIds } } });
      await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
    }

    emails.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("converges concurrent calls to one active admin and one sanitized audit", async () => {
    const environment = createEnvironment("concurrent");
    const database = databaseWithoutExistingAdmins();

    const results = await Promise.all([
      bootstrapProductionAdmin(environment, database),
      bootstrapProductionAdmin(environment, database),
    ]);
    const users = await prisma.appUser.findMany({
      where: { email: environment.BOOTSTRAP_ADMIN_EMAIL },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        passwordHash: true,
      },
    });

    expect(results.map((result) => result.status).sort()).toEqual(["created", "existing"]);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: environment.BOOTSTRAP_ADMIN_EMAIL,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: true,
    });

    const audits = await prisma.adminAuditLog.findMany({
      where: { targetId: users[0]?.id, action: "PRODUCTION_ADMIN_BOOTSTRAPPED" },
      select: { actorId: true, adminUserId: true, meta: true, before: true, after: true },
    });

    expect(audits).toEqual([
      {
        actorId: "system:production-bootstrap",
        adminUserId: null,
        meta: { source: "production-bootstrap" },
        before: null,
        after: null,
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain(environment.BOOTSTRAP_ADMIN_PASSWORD);
    expect(JSON.stringify(audits)).not.toContain(users[0]?.passwordHash ?? "");
  });

  it("rolls back the new admin when PostgreSQL rejects the success audit", async () => {
    const environment = createEnvironment("rollback");
    const database = databaseWithoutExistingAdmins();
    const suffix = runId.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const functionName = `a8_reject_bootstrap_audit_${suffix}`;
    const triggerName = `a8_reject_bootstrap_audit_trigger_${suffix}`;

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'PRODUCTION_ADMIN_BOOTSTRAPPED'
          AND NEW."actorId" = 'system:production-bootstrap' THEN
          RAISE EXCEPTION 'A8 forced bootstrap audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "AdminAuditLog"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"();
    `);

    try {
      await expect(bootstrapProductionAdmin(environment, database)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AdminAuditLog";`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"();`);
    }

    await expect(
      prisma.appUser.count({ where: { email: environment.BOOTSTRAP_ADMIN_EMAIL } }),
    ).resolves.toBe(0);
    await expect(
      prisma.adminAuditLog.count({
        where: { action: "PRODUCTION_ADMIN_BOOTSTRAPPED", actorId: "system:production-bootstrap" },
      }),
    ).resolves.toBe(0);
  });
});
