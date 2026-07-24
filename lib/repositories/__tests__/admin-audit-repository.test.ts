import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findUnique: vi.fn(),
  },
  adminAuditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type AdminAuditRepositoryModule = {
  createLog: (input: {
    actorId: string;
    actionType: string;
    entityType: string;
    entityId?: string | null;
    metadata?: {
      before?: unknown;
      after?: unknown;
      [key: string]: unknown;
    };
    timestamp?: Date;
  }) => Promise<{
    id: string;
    adminUserId: string;
    actorId?: string;
    actorEmail?: string | null;
    actorFullName?: string | null;
    actorRole?: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    before?: unknown;
    after?: unknown;
    meta: unknown;
    createdAt: Date;
  }>;
  createAdminAuditLog: (input: {
    adminUserId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    meta?: Record<string, unknown>;
  }) => Promise<{
    id: string;
    adminUserId: string;
    action: string;
    targetType: string;
    targetId: string | null;
    before?: unknown;
    after?: unknown;
    meta: unknown;
    createdAt: Date;
  }>;
  getLogs: (filters?: {
    adminUserId?: string;
    actionType?: string;
    entityType?: string;
    targetType?: string;
    targetId?: string;
    dateRange?: { from?: Date; to?: Date };
    limit?: number;
  }) => Promise<
    Array<{
      id: string;
      action: string;
      targetType: string;
      targetId: string | null;
      createdAt: Date;
      adminUser: { id: string; fullName: string; email: string };
      actorId?: string;
      actorEmail?: string | null;
      actorFullName?: string | null;
      actorRole?: string | null;
      meta: unknown;
    }>
  >;
};

async function loadAuditRepository() {
  const specifier = "@/lib/repositories/admin-audit-repository";
  return import(/* @vite-ignore */ specifier) as Promise<AdminAuditRepositoryModule>;
}

describe("admin-audit-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.appUser.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin1@example.com",
      fullName: "Admin One",
      role: "ADMIN",
    });
  });

  it("createLog captures actor, action, entity, timestamp, and before/after metadata", async () => {
    const createdAt = new Date("2026-05-04T10:00:00.000Z");
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-1",
      adminUserId: "admin-1",
      action: "CMS_PAGE_UPDATED",
      targetType: "cms_page",
      targetId: "page-1",
      before: { title: "Old title" },
      after: { title: "New title" },
      meta: {},
      createdAt,
    });

    const { createLog } = await loadAuditRepository();
    const result = await createLog({
      actorId: "admin-1",
      actionType: "CMS_PAGE_UPDATED",
      entityType: "cms_page",
      entityId: "page-1",
      metadata: {
        before: { title: "Old title" },
        after: { title: "New title" },
      },
      timestamp: createdAt,
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        actorId: "admin-1",
        actorEmail: "admin1@example.com",
        actorFullName: "Admin One",
        actorRole: "ADMIN",
        action: "CMS_PAGE_UPDATED",
        targetType: "cms_page",
        targetId: "page-1",
        before: { title: "Old title" },
        after: { title: "New title" },
        meta: {},
        createdAt,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "audit-1",
        adminUserId: "admin-1",
        action: "CMS_PAGE_UPDATED",
        targetType: "cms_page",
        targetId: "page-1",
        createdAt,
      }),
    );
  });

  it("createLog redacts sensitive before, after, and meta fields before persisting", async () => {
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-sensitive",
      adminUserId: "admin-1",
      action: "APP_USER_CREATED",
      targetType: "app_user",
      targetId: "user-1",
      before: null,
      after: {
        email: "safe@example.com",
        passwordHash: "[REDACTED]",
        nested: { twoFactorSecret: "[REDACTED]", backupCodes: "[REDACTED]" },
      },
      meta: { sessionToken: "[REDACTED]", actorRole: "ADMIN" },
      createdAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const { createLog } = await loadAuditRepository();
    await createLog({
      actorId: "admin-1",
      actionType: "APP_USER_CREATED",
      entityType: "app_user",
      entityId: "user-1",
      metadata: {
        before: null,
        after: {
          email: "safe@example.com",
          passwordHash: "hashed-password",
          nested: { twoFactorSecret: "TOTPSECRET", backupCodes: ["CODE-1"] },
        },
        sessionToken: "raw-session-token",
        actorRole: "ADMIN",
      },
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        actorId: "admin-1",
        actorEmail: "admin1@example.com",
        actorFullName: "Admin One",
        actorRole: "ADMIN",
        before: null,
        after: {
          email: "safe@example.com",
          passwordHash: "[REDACTED]",
          nested: { twoFactorSecret: "[REDACTED]", backupCodes: "[REDACTED]" },
        },
        meta: { sessionToken: "[REDACTED]", actorRole: "ADMIN" },
      }),
    });
    expect(JSON.stringify(prismaMock.adminAuditLog.create.mock.calls)).not.toMatch(
      /hashed-password|TOTPSECRET|CODE-1|raw-session-token/,
    );
  });

  it("centrally bounds auth identifiers, user agents, and nested string metadata", async () => {
    const longIdentifier = "i".repeat(400);
    const longUserAgent = "u".repeat(400);
    const longMetadata = "m".repeat(400);
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-bounded",
      adminUserId: "admin-1",
      action: "ADMIN_LOGIN_PASSWORD_VERIFIED",
      targetType: "AUTH",
      targetId: null,
      meta: {},
      createdAt: new Date("2026-07-15T10:00:00.000Z"),
    });

    const { createLog } = await loadAuditRepository();
    await createLog({
      actorId: "admin-1",
      actionType: "ADMIN_LOGIN_PASSWORD_VERIFIED",
      entityType: "AUTH",
      metadata: {
        identifier: longIdentifier,
        userAgent: longUserAgent,
        nested: { authenticationStage: longMetadata },
      },
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        meta: {
          identifier: longIdentifier.slice(0, 256),
          userAgent: longUserAgent.slice(0, 256),
          nested: { authenticationStage: longMetadata.slice(0, 256) },
        },
      }),
    });
  });

  it("createLog allows empty metadata for simple audit events", async () => {
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-2",
      adminUserId: "admin-1",
      action: "SECURITY_SETTINGS_VIEWED",
      targetType: "admin_security",
      targetId: null,
      meta: {},
      createdAt: new Date("2026-05-04T11:00:00.000Z"),
    });

    const { createLog } = await loadAuditRepository();
    await createLog({
      actorId: "admin-1",
      actionType: "SECURITY_SETTINGS_VIEWED",
      entityType: "admin_security",
      metadata: {},
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        actorId: "admin-1",
        actorEmail: "admin1@example.com",
        actorFullName: "Admin One",
        actorRole: "ADMIN",
        action: "SECURITY_SETTINGS_VIEWED",
        targetType: "admin_security",
        meta: {},
      }),
    });
  });

  it("createAdminAuditLog records actor role and meaningful before/after values for critical changes", async () => {
    const createdAt = new Date("2026-05-13T09:00:00.000Z");
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-critical-1",
      adminUserId: "admin-1",
      action: "STUDENT_LEARNING_STATUS_UPDATED",
      targetType: "student",
      targetId: "student-1",
      before: { learningStatus: "ACTIVE" },
      after: { learningStatus: "PAUSED" },
      meta: { actorRole: "ADMIN" },
      createdAt,
    });

    const { createAdminAuditLog } = await loadAuditRepository();
    const result = await createAdminAuditLog({
      adminUserId: "admin-1",
      action: "STUDENT_LEARNING_STATUS_UPDATED",
      targetType: "student",
      targetId: "student-1",
      before: { learningStatus: "ACTIVE" },
      after: { learningStatus: "PAUSED" },
      meta: { actorRole: "ADMIN" },
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        actorId: "admin-1",
        actorEmail: "admin1@example.com",
        actorFullName: "Admin One",
        actorRole: "ADMIN",
        action: "STUDENT_LEARNING_STATUS_UPDATED",
        targetType: "student",
        targetId: "student-1",
        before: { learningStatus: "ACTIVE" },
        after: { learningStatus: "PAUSED" },
        meta: { actorRole: "ADMIN" },
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "audit-critical-1",
        adminUserId: "admin-1",
        action: "STUDENT_LEARNING_STATUS_UPDATED",
        targetType: "student",
        targetId: "student-1",
      }),
    );
  });

  it("persists ISO report timestamps through the real audit sanitizer boundary", async () => {
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-report-export",
      adminUserId: "admin-1",
      action: "REPORT_PDF_EXPORTED",
      targetType: "reportSnapshot",
      targetId: "snapshot-1",
      before: { pdfGeneratedAt: "2026-05-21T10:00:00.000Z" },
      after: { pdfGeneratedAt: "2026-05-21T11:00:00.000Z" },
      meta: { pdfGeneratedAt: "2026-05-21T11:00:00.000Z" },
      createdAt: new Date("2026-05-21T11:00:01.000Z"),
    });

    const { createAdminAuditLog } = await loadAuditRepository();
    await createAdminAuditLog({
      adminUserId: "admin-1",
      action: "REPORT_PDF_EXPORTED",
      targetType: "reportSnapshot",
      targetId: "snapshot-1",
      before: { pdfGeneratedAt: "2026-05-21T10:00:00.000Z" },
      after: { pdfGeneratedAt: "2026-05-21T11:00:00.000Z" },
      meta: { pdfGeneratedAt: "2026-05-21T11:00:00.000Z" },
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: { pdfGeneratedAt: "2026-05-21T10:00:00.000Z" },
        after: { pdfGeneratedAt: "2026-05-21T11:00:00.000Z" },
        meta: { pdfGeneratedAt: "2026-05-21T11:00:00.000Z" },
      }),
    });
  });

  it("createLog surfaces database failures cleanly", async () => {
    prismaMock.adminAuditLog.create.mockRejectedValueOnce(new Error("Database connection lost"));

    const { createLog } = await loadAuditRepository();

    await expect(
      createLog({
        actorId: "admin-1",
        actionType: "ENQUIRY_STATUS_UPDATED",
        entityType: "enquiry",
        entityId: "enq-1",
      }),
    ).rejects.toThrow(/database|connection/i);
  });

  it("keeps an immutable actor snapshot even when the live actor row is unavailable", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    prismaMock.adminAuditLog.create.mockResolvedValueOnce({
      id: "audit-orphaned-actor",
      adminUserId: null,
      actorId: "deleted-admin-1",
      actorEmail: null,
      actorFullName: null,
      actorRole: null,
      action: "APP_USER_STATUS_UPDATED",
      targetType: "app_user",
      targetId: "user-1",
      meta: {},
      createdAt: new Date("2026-05-04T11:00:00.000Z"),
    });

    const { createLog } = await loadAuditRepository();
    await createLog({
      actorId: "deleted-admin-1",
      actionType: "APP_USER_STATUS_UPDATED",
      entityType: "app_user",
      entityId: "user-1",
    });

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: null,
        actorId: "deleted-admin-1",
        actorEmail: null,
        actorFullName: null,
        actorRole: null,
      }),
    });
  });

  it("getLogs filters by date range, admin user, action type, and entity", async () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-04T23:59:59.999Z");
    prismaMock.adminAuditLog.findMany.mockResolvedValueOnce([
      {
        id: "audit-1",
        action: "CMS_PAGE_UPDATED",
        targetType: "cms_page",
        targetId: "page-1",
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        meta: {
          before: { title: "Old title" },
          after: { title: "New title" },
        },
        adminUser: {
          id: "admin-1",
          fullName: "Admin One",
          email: "admin1@example.com",
        },
      },
    ]);

    const { getLogs } = await loadAuditRepository();
    const result = await getLogs({
      adminUserId: "admin-1",
      actionType: "CMS_PAGE_UPDATED",
      entityType: "cms_page",
      dateRange: { from, to },
      limit: 20,
    });

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorId: "admin-1",
        action: "CMS_PAGE_UPDATED",
        targetType: "cms_page",
        createdAt: { gte: from, lte: to },
      },
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
      take: 20,
      skip: 0,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: "audit-1",
        action: "CMS_PAGE_UPDATED",
        targetType: "cms_page",
      }),
    ]);
  });

  it("getLogs can filter critical-change history by actor and exact target id", async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValueOnce([]);

    const { getLogs } = await loadAuditRepository();
    await getLogs({
      adminUserId: "admin-1",
      targetType: "student",
      targetId: "student-1",
      limit: 10,
    });

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {
        actorId: "admin-1",
        targetType: "student",
        targetId: "student-1",
      },
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
      take: 10,
      skip: 0,
    });
  });

  it("getLogs returns recent logs when filters are omitted", async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValueOnce([]);

    const { getLogs } = await loadAuditRepository();
    const result = await getLogs();

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {},
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
      take: 50,
      skip: 0,
    });
    expect(result).toEqual([]);
  });
});
