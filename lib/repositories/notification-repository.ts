import {
  NotificationType,
  type Prisma,
  type ReminderChannel,
  type ReminderDeliveryStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type NotificationDatabase = typeof prisma | Prisma.TransactionClient;

export type NotificationFilters = {
  status?: "all" | "read" | "unread" | string | null;
  type?: NotificationType | string | null;
};

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedHref: string | null;
  deliveryStatus: ReminderDeliveryStatus;
  details: string | null;
  createdAt: Date;
  readAt: Date | null;
  isRead: boolean;
};

export type ReminderLogFilters = {
  channel?: "EMAIL" | "WHATSAPP" | "all" | string | null;
  status?: "SENT" | "FAILED" | "SKIPPED" | "all" | string | null;
  type?: "lesson" | "assignment" | "all" | string | null;
};

function normalizeNotificationStatus(status: NotificationFilters["status"]) {
  return status === "read" || status === "unread" ? status : "all";
}

function normalizeNotificationType(type: NotificationFilters["type"]) {
  return Object.values(NotificationType).includes(type as NotificationType)
    ? (type as NotificationType)
    : null;
}

function safeHref(href?: string | null) {
  if (!href) return null;
  if (href.startsWith("/portal/")) return href;
  if (href.startsWith("/admin/")) return href;
  if (href.startsWith("/uploads/")) return href;

  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function mapNotification(
  notification: Prisma.InAppNotificationGetPayload<Record<string, never>>,
): NotificationRow {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    relatedHref: safeHref(notification.relatedHref),
    deliveryStatus: notification.deliveryStatus,
    details: notification.details,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    isRead: Boolean(notification.readAt),
  };
}

export async function createInAppNotification(
  input: {
    body: string;
    dedupeKey: string;
    deliveryStatus?: ReminderDeliveryStatus;
    details?: string | null;
    recipientUserId: string;
    relatedHref?: string | null;
    sourceReminderLogId?: string | null;
    title: string;
    type: NotificationType;
  },
  database: NotificationDatabase = prisma,
) {
  return database.inAppNotification.upsert({
    where: {
      recipientUserId_dedupeKey: {
        dedupeKey: input.dedupeKey,
        recipientUserId: input.recipientUserId,
      },
    },
    create: {
      body: input.body,
      dedupeKey: input.dedupeKey,
      deliveryStatus: input.deliveryStatus ?? "SENT",
      details: input.details ?? null,
      recipientUserId: input.recipientUserId,
      relatedHref: safeHref(input.relatedHref),
      sourceReminderLogId: input.sourceReminderLogId ?? null,
      title: input.title,
      type: input.type,
    },
    update: {
      body: input.body,
      deliveryStatus: input.deliveryStatus ?? "SENT",
      details: input.details ?? null,
      relatedHref: safeHref(input.relatedHref),
      title: input.title,
      type: input.type,
    },
  });
}

export async function listNotificationsForUser(
  userId: string,
  filters: NotificationFilters = {},
  database: NotificationDatabase = prisma,
) {
  const status = normalizeNotificationStatus(filters.status);
  const type = normalizeNotificationType(filters.type);
  const where: Prisma.InAppNotificationWhereInput = {
    recipientUserId: userId,
    ...(type ? { type } : {}),
    ...(status === "read" ? { readAt: { not: null } } : {}),
    ...(status === "unread" ? { readAt: null } : {}),
  };

  const notifications = await database.inAppNotification.findMany({
    where,
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
  });

  return notifications.map(mapNotification);
}

export async function countUnreadNotificationsForUser(
  userId: string,
  database: NotificationDatabase = prisma,
) {
  return database.inAppNotification.count({
    where: { recipientUserId: userId, readAt: null },
  });
}

export async function markNotificationReadForUser(
  userId: string,
  notificationId: string,
  database: NotificationDatabase = prisma,
) {
  return database.inAppNotification.updateMany({
    where: { id: notificationId, recipientUserId: userId },
    data: { readAt: new Date() },
  });
}

export async function getNotificationPreference(
  userId: string,
  database: NotificationDatabase = prisma,
) {
  const existing = await database.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;

  return database.notificationPreference.create({
    data: { userId },
  });
}

export async function updateNotificationPreference(
  userId: string,
  input: { emailEnabled?: boolean; whatsappEnabled?: boolean },
  database: NotificationDatabase = prisma,
) {
  return database.notificationPreference.upsert({
    where: { userId },
    create: {
      emailEnabled: input.emailEnabled ?? true,
      userId,
      whatsappEnabled: input.whatsappEnabled ?? true,
    },
    update: {
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
      ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: input.whatsappEnabled } : {}),
    },
  });
}

export async function listNotificationPreferencesByUserIds(
  userIds: string[],
  database: NotificationDatabase = prisma,
) {
  if (userIds.length === 0)
    return new Map<string, { emailEnabled: boolean; whatsappEnabled: boolean }>();

  const preferences = await database.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: { emailEnabled: true, userId: true, whatsappEnabled: true },
  });

  return new Map(
    preferences.map((preference) => [
      preference.userId,
      {
        emailEnabled: preference.emailEnabled,
        whatsappEnabled: preference.whatsappEnabled,
      },
    ]),
  );
}

function normalizeReminderStatus(status: ReminderLogFilters["status"]) {
  return status === "SENT" || status === "FAILED" || status === "SKIPPED" ? status : null;
}

function normalizeReminderChannel(channel: ReminderLogFilters["channel"]) {
  return channel === "EMAIL" || channel === "WHATSAPP" ? channel : null;
}

export async function listAdminReminderLogs(filters: ReminderLogFilters = {}) {
  const status = normalizeReminderStatus(filters.status);
  const channel = normalizeReminderChannel(filters.channel);
  const where: Prisma.ReminderLogWhereInput = {
    ...(status ? { status } : {}),
    ...(channel ? { channel: channel as ReminderChannel } : {}),
  };
  const assignmentWhere: Prisma.AssignmentReminderLogWhereInput = {
    ...(status ? { status } : {}),
    ...(channel ? { channel: channel as ReminderChannel } : {}),
  };

  const lessonLogs =
    filters.type === "assignment"
      ? []
      : await prisma.reminderLog.findMany({
          where,
          include: {
            scheduledClass: {
              select: {
                id: true,
                title: true,
                startAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
  const assignmentLogs =
    filters.type === "lesson"
      ? []
      : await prisma.assignmentReminderLog.findMany({
          where: assignmentWhere,
          include: {
            assignment: {
              select: {
                id: true,
                title: true,
                dueDate: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        });

  return [
    ...lessonLogs.map((log) => ({
      channel: log.channel,
      createdAt: log.createdAt,
      details: log.details,
      id: log.id,
      recipientEmail: log.recipientEmail,
      recipientUserId: log.recipientUserId,
      status: log.status,
      targetId: log.scheduledClassId,
      targetTitle: log.scheduledClass.title,
      targetWhen: log.scheduledClass.startAt,
      type: "lesson" as const,
    })),
    ...assignmentLogs.map((log) => ({
      channel: log.channel,
      createdAt: log.createdAt,
      details: log.details,
      id: log.id,
      recipientEmail: log.recipientEmail,
      recipientUserId: log.recipientUserId,
      status: log.status,
      targetId: log.assignmentId,
      targetTitle: log.assignment.title,
      targetWhen: log.assignment.dueDate,
      type: "assignment" as const,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
