import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { INITIAL_PASSWORD_MAX_LENGTH } from "@/lib/validations/initial-password";

const SYSTEM_ACTOR_ID = "system:production-bootstrap";
const PRODUCTION_ADMIN_AUDIT_ACTION = "PRODUCTION_ADMIN_BOOTSTRAPPED";
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 200;

const productionAdminEnvironmentSchema = z
  .object({
    BOOTSTRAP_ADMIN_EMAIL: z.string().trim().min(1).max(MAX_EMAIL_LENGTH).email(),
    BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(INITIAL_PASSWORD_MAX_LENGTH),
  })
  .strict();

type ProductionAdminEnvironment = Record<string, string | undefined>;

type ExistingUser = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

type CreatedUser = {
  id: string;
  email: string;
};

type ProductionAdminTransaction = {
  appUser: {
    count(args: { where: { role: UserRole; isActive: true } }): Promise<number>;
    findUnique(args: {
      where: { email: string };
      select: { id: true; email: true; role: true; isActive: true };
    }): Promise<ExistingUser | null>;
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
    findUnique(args: {
      where: { email: string };
      select: { id: true; email: true; role: true; isActive: true };
    }): Promise<ExistingUser | null>;
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

function parseConfiguredEnvironment(environment: ProductionAdminEnvironment) {
  const raw = {
    BOOTSTRAP_ADMIN_EMAIL: normalizeEnvironmentValue(environment.BOOTSTRAP_ADMIN_EMAIL),
    BOOTSTRAP_ADMIN_NAME: normalizeEnvironmentValue(environment.BOOTSTRAP_ADMIN_NAME),
    BOOTSTRAP_ADMIN_PASSWORD: normalizeEnvironmentValue(environment.BOOTSTRAP_ADMIN_PASSWORD),
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
    email: parsed.data.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
    fullName: parsed.data.BOOTSTRAP_ADMIN_NAME,
    password: parsed.data.BOOTSTRAP_ADMIN_PASSWORD,
  };
}

function isActiveAdmin(user: ExistingUser | null): user is ExistingUser {
  return user?.role === UserRole.ADMIN && user.isActive;
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

export async function bootstrapProductionAdmin(
  environment: ProductionAdminEnvironment,
  database: ProductionAdminDatabase,
): Promise<ProductionAdminBootstrapResult> {
  const activeAdminCount = await database.appUser.count({
    where: { role: UserRole.ADMIN, isActive: true },
  });
  const configured = parseConfiguredEnvironment(environment);

  if (!configured) {
    if (activeAdminCount > 0) {
      return { status: "existing" };
    }

    throw new ProductionAdminBootstrapError();
  }

  const existing = await database.appUser.findUnique({
    where: { email: configured.email },
    select: { id: true, email: true, role: true, isActive: true },
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
          select: { id: true, email: true, role: true, isActive: true },
        });

        if (existingInTransaction) {
          if (isActiveAdmin(existingInTransaction)) {
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
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (isActiveAdmin(racedUser)) {
      return { status: "existing" };
    }

    if (serializableConflict) {
      throw error;
    }

    throw new ProductionAdminBootstrapError();
  }
}
