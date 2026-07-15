import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { INITIAL_PASSWORD_MAX_LENGTH } from "@/lib/validations/initial-password";
import { mailboxSchema } from "@/lib/validations/mailbox";

const SYSTEM_ACTOR_ID = "system:production-bootstrap";
const PRODUCTION_ADMIN_AUDIT_ACTION = "PRODUCTION_ADMIN_BOOTSTRAPPED";
const MAX_NAME_LENGTH = 200;

const productionAdminEnvironmentSchema = z
  .object({
    BOOTSTRAP_ADMIN_EMAIL: mailboxSchema,
    BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(INITIAL_PASSWORD_MAX_LENGTH),
  })
  .strict();

const productionAdminEnvironmentBoundarySchema = z
  .object({
    BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
    BOOTSTRAP_ADMIN_NAME: z.string().optional(),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  })
  .passthrough();

type ExistingUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorBackupCodes: string[];
};

type CreatedUser = {
  id: string;
  email: string;
};

type BootstrapAudit = {
  adminUserId: string | null;
  actorId: string;
  actorEmail: string | null;
  actorFullName: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
};

type BootstrapAuditFindArgs = {
  where: {
    targetId: string;
    action: string;
    actorId: string;
  };
  select: {
    adminUserId: true;
    actorId: true;
    actorEmail: true;
    actorFullName: true;
    actorRole: true;
    action: true;
    targetType: true;
    targetId: true;
    before: true;
    after: true;
    meta: true;
  };
};

type BootstrapUserFindArgs = {
  where: { email: string };
  select: {
    id: true;
    email: true;
    fullName: true;
    role: true;
    isActive: true;
    mustChangePassword: true;
    twoFactorEnabled: true;
    twoFactorSecret: true;
    twoFactorBackupCodes: true;
  };
};

type ProductionAdminTransaction = {
  appUser: {
    count(args: { where: { role: UserRole; isActive: true } }): Promise<number>;
    findUnique(args: BootstrapUserFindArgs): Promise<ExistingUser | null>;
    create(args: {
      data: {
        email: string;
        fullName: string;
        role: UserRole;
        passwordHash: string;
        mustChangePassword: true;
        isActive: true;
      };
      select: { id: true; email: true };
    }): Promise<CreatedUser>;
  };
  adminAuditLog: {
    findFirst(args: BootstrapAuditFindArgs): Promise<BootstrapAudit | null>;
    create(args: {
      data: {
        adminUserId: null;
        actorId: string;
        actorEmail: null;
        actorFullName: null;
        actorRole: string;
        action: string;
        targetType: string;
        targetId: string;
        meta: { source: string };
      };
    }): Promise<unknown>;
  };
};

export type ProductionAdminDatabase = {
  appUser: {
    count(args: { where: { role: UserRole; isActive: true } }): Promise<number>;
    findUnique(args: BootstrapUserFindArgs): Promise<ExistingUser | null>;
  };
  adminAuditLog: {
    findFirst(args: BootstrapAuditFindArgs): Promise<BootstrapAudit | null>;
  };
  $transaction<T>(
    callback: (transaction: ProductionAdminTransaction) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
};

export type ProductionAdminBootstrapResult =
  | { status: "created"; user: CreatedUser }
  | { status: "existing" };

export class ProductionAdminBootstrapError extends Error {
  constructor() {
    super("Production admin bootstrap failed");
    this.name = "ProductionAdminBootstrapError";
  }
}

class ActiveAdminAppearedDuringBootstrapError extends Error {
  constructor() {
    super("An active administrator appeared during bootstrap");
    this.name = "ActiveAdminAppearedDuringBootstrapError";
  }
}

function normalizeEnvironmentValue(value: string | undefined) {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}

function parseConfiguredEnvironment(environment: unknown) {
  const boundary = productionAdminEnvironmentBoundarySchema.safeParse(environment);
  if (!boundary.success) {
    throw new ProductionAdminBootstrapError();
  }

  const raw = {
    BOOTSTRAP_ADMIN_EMAIL: normalizeEnvironmentValue(boundary.data.BOOTSTRAP_ADMIN_EMAIL),
    BOOTSTRAP_ADMIN_NAME: normalizeEnvironmentValue(boundary.data.BOOTSTRAP_ADMIN_NAME),
    BOOTSTRAP_ADMIN_PASSWORD: normalizeEnvironmentValue(boundary.data.BOOTSTRAP_ADMIN_PASSWORD),
  };
  const configuredCount = Object.values(raw).filter((value) => value !== undefined).length;

  if (configuredCount === 0) {
    return null;
  }

  if (configuredCount !== 3) {
    throw new ProductionAdminBootstrapError();
  }

  const parsed = productionAdminEnvironmentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProductionAdminBootstrapError();
  }

  return {
    email: parsed.data.BOOTSTRAP_ADMIN_EMAIL,
    fullName: parsed.data.BOOTSTRAP_ADMIN_NAME,
    password: parsed.data.BOOTSTRAP_ADMIN_PASSWORD,
  };
}

function isActiveAdmin(user: ExistingUser | null): user is ExistingUser {
  return user?.role === UserRole.ADMIN && user.isActive;
}

function hasExactBootstrapMetadata(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return false;
  }

  const entries = Object.entries(metadata);
  return (
    entries.length === 1 &&
    entries[0]?.[0] === "source" &&
    entries[0]?.[1] === "production-bootstrap"
  );
}

function isExpectedBootstrapAudit(audit: BootstrapAudit | null, targetId: string) {
  return (
    audit?.adminUserId === null &&
    audit.actorId === SYSTEM_ACTOR_ID &&
    audit.actorEmail === null &&
    audit.actorFullName === null &&
    audit.actorRole === "SYSTEM" &&
    audit.action === PRODUCTION_ADMIN_AUDIT_ACTION &&
    audit.targetType === "AppUser" &&
    audit.targetId === targetId &&
    audit.before === null &&
    audit.after === null &&
    hasExactBootstrapMetadata(audit.meta)
  );
}

function isExpectedBootstrapWinner(
  user: ExistingUser | null,
  audit: BootstrapAudit | null,
  configured: { email: string; fullName: string },
): user is ExistingUser {
  return (
    user?.email === configured.email &&
    user.fullName === configured.fullName &&
    user.role === UserRole.ADMIN &&
    user.isActive &&
    user.mustChangePassword &&
    !user.twoFactorEnabled &&
    user.twoFactorSecret === null &&
    user.twoFactorBackupCodes.length === 0 &&
    isExpectedBootstrapAudit(audit, user.id)
  );
}

const bootstrapUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorBackupCodes: true,
} as const;

const bootstrapAuditSelect = {
  adminUserId: true,
  actorId: true,
  actorEmail: true,
  actorFullName: true,
  actorRole: true,
  action: true,
  targetType: true,
  targetId: true,
  before: true,
  after: true,
  meta: true,
} as const;

async function findBootstrapAudit(
  database: Pick<ProductionAdminDatabase, "adminAuditLog"> | ProductionAdminTransaction,
  targetId: string,
) {
  return database.adminAuditLog.findFirst({
    where: {
      targetId,
      action: PRODUCTION_ADMIN_AUDIT_ACTION,
      actorId: SYSTEM_ACTOR_ID,
    },
    select: bootstrapAuditSelect,
  });
}

function isExpectedEmailUniqueViolation(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  if (error.code !== "P2002" || !("meta" in error) || typeof error.meta !== "object") {
    return false;
  }

  const target = error.meta && "target" in error.meta ? error.meta.target : undefined;
  return target === "email" || (Array.isArray(target) && target.includes("email"));
}

function isSerializableTransactionConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

async function executeProductionAdminBootstrap(
  configured: ReturnType<typeof parseConfiguredEnvironment>,
  database: ProductionAdminDatabase,
): Promise<ProductionAdminBootstrapResult> {
  const activeAdminCount = await database.appUser.count({
    where: { role: UserRole.ADMIN, isActive: true },
  });

  if (!configured) {
    if (activeAdminCount > 0) {
      return { status: "existing" };
    }

    throw new ProductionAdminBootstrapError();
  }

  const existing = await database.appUser.findUnique({
    where: { email: configured.email },
    select: bootstrapUserSelect,
  });

  if (existing) {
    if (isActiveAdmin(existing)) {
      return { status: "existing" };
    }

    throw new ProductionAdminBootstrapError();
  }

  if (activeAdminCount > 0) {
    throw new ProductionAdminBootstrapError();
  }

  const passwordHash = await hashPassword(configured.password);

  try {
    return await database.$transaction(
      async (transaction) => {
        const existingInTransaction = await transaction.appUser.findUnique({
          where: { email: configured.email },
          select: bootstrapUserSelect,
        });

        if (existingInTransaction) {
          const audit = await findBootstrapAudit(transaction, existingInTransaction.id);
          if (isExpectedBootstrapWinner(existingInTransaction, audit, configured)) {
            return { status: "existing" } as const;
          }

          throw new ProductionAdminBootstrapError();
        }

        const activeAdminCountInTransaction = await transaction.appUser.count({
          where: { role: UserRole.ADMIN, isActive: true },
        });
        if (activeAdminCountInTransaction > 0) {
          throw new ActiveAdminAppearedDuringBootstrapError();
        }

        const created = await transaction.appUser.create({
          data: {
            email: configured.email,
            fullName: configured.fullName,
            role: UserRole.ADMIN,
            passwordHash,
            mustChangePassword: true,
            isActive: true,
          },
          select: { id: true, email: true },
        });

        await transaction.adminAuditLog.create({
          data: {
            adminUserId: null,
            actorId: SYSTEM_ACTOR_ID,
            actorEmail: null,
            actorFullName: null,
            actorRole: "SYSTEM",
            action: PRODUCTION_ADMIN_AUDIT_ACTION,
            targetType: "AppUser",
            targetId: created.id,
            meta: { source: "production-bootstrap" },
          },
        });

        return { status: "created", user: created } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    const activeAdminAppeared = error instanceof ActiveAdminAppearedDuringBootstrapError;
    const serializableConflict = isSerializableTransactionConflict(error);
    if (!activeAdminAppeared && !serializableConflict && !isExpectedEmailUniqueViolation(error)) {
      throw error;
    }

    const racedUser = await database.appUser.findUnique({
      where: { email: configured.email },
      select: bootstrapUserSelect,
    });
    const audit = racedUser ? await findBootstrapAudit(database, racedUser.id) : null;

    if (isExpectedBootstrapWinner(racedUser, audit, configured)) {
      return { status: "existing" };
    }

    if (serializableConflict) {
      throw error;
    }

    throw new ProductionAdminBootstrapError();
  }
}

export async function bootstrapProductionAdmin(
  environment: unknown,
  database: ProductionAdminDatabase,
): Promise<ProductionAdminBootstrapResult> {
  try {
    const configured = parseConfiguredEnvironment(environment);
    return await executeProductionAdminBootstrap(configured, database);
  } catch {
    throw new ProductionAdminBootstrapError();
  }
}
