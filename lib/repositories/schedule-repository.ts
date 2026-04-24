import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function listScheduleForUser(userId: string, role: UserRole, monthStart: Date, monthEnd: Date) {
  return prisma.scheduledClass.findMany({
    where: {
      startAt: {
        gte: monthStart,
        lt: monthEnd,
      },
      OR:
        role === UserRole.ADMIN
          ? undefined
          : [
              { teacherId: userId },
              {
                participantUserIds: {
                  has: userId,
                },
              },
            ],
    },
    include: {
      teacher: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { startAt: "asc" },
  });
}

export async function listUpcomingClassesForReminders(windowStart: Date, windowEnd: Date) {
  return prisma.scheduledClass.findMany({
    where: {
      startAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: {
      teacher: {
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneWhatsapp: true,
        },
      },
      reminders: {
        where: {
          createdAt: {
            gte: new Date(Date.now() - 1000 * 60 * 60 * 3),
          },
        },
      },
    },
    orderBy: { startAt: "asc" },
  });
}

export async function createReminderLog(input: {
  scheduledClassId: string;
  recipientUserId: string;
  recipientEmail: string;
  channel: "EMAIL" | "WHATSAPP";
  status: "SENT" | "FAILED" | "SKIPPED";
  details?: string;
}) {
  return prisma.reminderLog.create({
    data: {
      scheduledClassId: input.scheduledClassId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      channel: input.channel,
      status: input.status,
      details: input.details,
    },
  });
}
