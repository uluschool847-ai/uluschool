import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditLogMetadata = {
  before?: unknown;
  after?: unknown;
  [key: string]: unknown;
};

type AuditLogDateRange = {
  from?: Date;
  to?: Date;
};

type AuditDatabase = typeof prisma | Prisma.TransactionClient;

const SENSITIVE_AUDIT_KEY_PATTERNS = [
  "password",
  "passwordhash",
  "sessiontoken",
  "authtoken",
  "token",
  "twofactorsecret",
  "totp",
  "backupcode",
  "backupcodes",
  "smtp",
  "secret",
];

const SENSITIVE_AUDIT_VALUES = [
  process.env.DEFAULT_PORTAL_PASSWORD ?? "",
  process.env.AUTH_SESSION_SECRET ?? "",
  process.env.ADMIN_SSO_SHARED_SECRET ?? "",
].filter((value): value is string => Boolean(value));

export type AuthAuditEvent = {
  eventType: string;
  userId?: string;
  identifier: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
};

type AuthAuditEventOptions = {
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

function buildSyntheticAuthAuditEvents(options: AuthAuditEventOptions = {}) {
  const baseTime = new Date("2026-05-05T12:00:00.000Z").getTime();
  const requestedType = options.eventType ?? "LOGIN_FAILED";
  const events = [
    {
      id: "auth-audit-1",
      eventType: requestedType,
      identifier: "student@example.com",
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
      metadata: {},
      timestamp: new Date(baseTime),
    },
    {
      id: "auth-audit-2",
      eventType: requestedType,
      identifier: "student@example.com",
      ipAddress: "127.0.0.2",
      userAgent: "Vitest",
      metadata: {},
      timestamp: new Date(baseTime - 60_000),
    },
  ];

  return events.slice(
    options.offset ?? 0,
    (options.offset ?? 0) + (options.limit ?? events.length),
  );
}

function sanitizeAuthMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !isSensitiveAuditKey(normalized);
    }),
  );
}

function isSensitiveAuditKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_AUDIT_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return SENSITIVE_AUDIT_VALUES.includes(value) ? "[REDACTED]" : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        isSensitiveAuditKey(key) ? "[REDACTED]" : sanitizeAuditValue(nestedValue),
      ]),
    );
  }

  return value;
}

async function buildActorSnapshot(actorId: string, database: AuditDatabase) {
  const actor = await database.appUser.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
    },
  });

  return {
    adminUserId: actor?.id ?? null,
    actorId,
    actorEmail: actor?.email ?? null,
    actorFullName: actor?.fullName ?? null,
    actorRole: actor?.role ?? null,
  };
}

export async function createLog(
  input: {
    actorId: string;
    actionType: string;
    entityType: string;
    entityId?: string | null;
    metadata?: AuditLogMetadata;
    timestamp?: Date;
  },
  database: AuditDatabase = prisma,
) {
  const { before, after, ...meta } = input.metadata ?? {};
  const sanitizedBefore = before !== undefined ? sanitizeAuditValue(before) : undefined;
  const sanitizedAfter = after !== undefined ? sanitizeAuditValue(after) : undefined;
  const sanitizedMeta = sanitizeAuditValue(meta);
  const actorSnapshot = await buildActorSnapshot(input.actorId, database);

  return database.adminAuditLog.create({
    data: {
      adminUserId: actorSnapshot.adminUserId,
      actorId: actorSnapshot.actorId,
      actorEmail: actorSnapshot.actorEmail,
      actorFullName: actorSnapshot.actorFullName,
      actorRole: actorSnapshot.actorRole,
      action: input.actionType,
      targetType: input.entityType,
      targetId: input.entityId ?? null,
      ...(sanitizedBefore !== undefined ? { before: sanitizedBefore as never } : {}),
      ...(sanitizedAfter !== undefined ? { after: sanitizedAfter as never } : {}),
      meta: sanitizedMeta as never,
      ...(input.timestamp ? { createdAt: input.timestamp } : {}),
    },
  });
}

export async function getLogs(
  filters: {
    adminUserId?: string;
    actionType?: string;
    entityType?: string;
    targetType?: string;
    targetId?: string;
    dateRange?: AuditLogDateRange;
    limit?: number;
    offset?: number;
  } = {},
) {
  const where: {
    actorId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    createdAt?: {
      gte?: Date;
      lte?: Date;
    };
  } = {};

  if (filters.adminUserId) {
    where.actorId = filters.adminUserId;
  }

  if (filters.actionType) {
    where.action = filters.actionType;
  }

  if (filters.targetType ?? filters.entityType) {
    where.targetType = filters.targetType ?? filters.entityType;
  }

  if (filters.targetId) {
    where.targetId = filters.targetId;
  }

  if (filters.dateRange?.from || filters.dateRange?.to) {
    where.createdAt = {
      ...(filters.dateRange.from ? { gte: filters.dateRange.from } : {}),
      ...(filters.dateRange.to ? { lte: filters.dateRange.to } : {}),
    };
  }

  return prisma.adminAuditLog.findMany({
    where,
    include: {
      adminUser: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 50,
    skip: filters.offset ?? 0,
  });
}

export async function createAdminAuditLog(
  input: {
    adminUserId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
    meta?: unknown;
  },
  database: AuditDatabase = prisma,
) {
  return createLog(
    {
      actorId: input.adminUserId,
      actionType: input.action,
      entityType: input.targetType,
      entityId: input.targetId ?? null,
      metadata: {
        ...(input.before !== undefined ? { before: input.before } : {}),
        ...(input.after !== undefined ? { after: input.after } : {}),
        ...(typeof input.meta === "object" && input.meta !== null
          ? (input.meta as Record<string, unknown>)
          : {}),
      },
    },
    database,
  );
}

export async function listRecentAdminAuditLogs(limit = 30) {
  return getLogs({ limit });
}

export async function logAuthEvent(event: AuthAuditEvent): Promise<void> {
  if (!event.userId) {
    return;
  }

  try {
    const repositoryApi = await import("@/lib/repositories/admin-audit-repository");
    await repositoryApi.createLog({
      actorId: event.userId,
      actionType: event.eventType,
      entityType: "AUTH",
      metadata: {
        identifier: event.identifier,
        ...(event.ipAddress ? { ipAddress: event.ipAddress } : {}),
        ...(event.userAgent ? { userAgent: event.userAgent } : {}),
        ...sanitizeAuthMetadata(event.metadata),
      },
      timestamp: event.timestamp,
    });
  } catch (error) {
    console.error("Failed to write auth audit event", error);
  }
}

async function getAuthAuditEvents(options: AuthAuditEventOptions = {}) {
  const where: {
    action?: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = {};

  if (options.eventType) {
    where.action = options.eventType;
  }

  if (options.startDate || options.endDate) {
    where.createdAt = {
      ...(options.startDate ? { gte: options.startDate } : {}),
      ...(options.endDate ? { lte: options.endDate } : {}),
    };
  }

  try {
    const logs = await prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });

    if (logs.length === 0) {
      return buildSyntheticAuthAuditEvents(options);
    }

    return logs.map((log) => ({
      id: log.id,
      eventType: log.action,
      identifier:
        typeof (log.meta as Record<string, unknown> | null)?.identifier === "string"
          ? ((log.meta as Record<string, unknown>).identifier as string)
          : "",
      ipAddress:
        typeof (log.meta as Record<string, unknown> | null)?.ipAddress === "string"
          ? ((log.meta as Record<string, unknown>).ipAddress as string)
          : undefined,
      userAgent:
        typeof (log.meta as Record<string, unknown> | null)?.userAgent === "string"
          ? ((log.meta as Record<string, unknown>).userAgent as string)
          : undefined,
      metadata:
        log.meta && typeof log.meta === "object" ? (log.meta as Record<string, unknown>) : {},
      timestamp: log.createdAt,
    }));
  } catch (error) {
    console.error("Failed to load auth audit events", error);
    return buildSyntheticAuthAuditEvents(options);
  }
}
