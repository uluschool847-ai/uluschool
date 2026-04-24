import { prisma } from "@/lib/prisma";

export async function createAdminAuditLog(input: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
}) {
  return prisma.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId || null,
      before: input.before as never,
      after: input.after as never,
      meta: input.meta as never,
    },
  });
}

export async function listRecentAdminAuditLogs(limit = 30) {
  return prisma.adminAuditLog.findMany({
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
    take: limit,
  });
}
