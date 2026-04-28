import { ReminderChannel, type ReminderDeliveryStatus } from "@prisma/client";

import {
  createReminderLog,
  listUpcomingClassesForReminders,
} from "@/lib/repositories/schedule-repository";
import { getUsersByIds } from "@/lib/repositories/user-repository";
import { sendClassReminderEmail } from "@/lib/services/email";

async function sendWhatsAppReminder(input: {
  phone: string | null;
  recipientName: string;
  classTitle: string;
  startAt: Date;
  liveLessonUrl: string;
}) {
  const webhook = process.env.WHATSAPP_WEBHOOK_URL;
  if (!webhook || !input.phone) {
    return {
      delivered: false,
      reason: "WHATSAPP_NOT_CONFIGURED" as const,
    };
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to: input.phone,
        template: "class_reminder",
        data: {
          recipientName: input.recipientName,
          classTitle: input.classTitle,
          startAt: input.startAt.toISOString(),
          liveLessonUrl: input.liveLessonUrl,
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { delivered: false, reason: "WHATSAPP_FAILED" as const };
    }

    return { delivered: true as const };
  } catch {
    return { delivered: false as const, reason: "WHATSAPP_FAILED" as const };
  }
}

function alreadySent(
  recentLogs: Array<{
    recipientUserId: string;
    channel: ReminderChannel;
    status: ReminderDeliveryStatus;
  }>,
  userId: string,
  channel: ReminderChannel,
) {
  return recentLogs.some(
    (log) => log.recipientUserId === userId && log.channel === channel && log.status === "SENT",
  );
}

export async function processDueReminders() {
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 1000 * 60 * 70);

  const classes = await listUpcomingClassesForReminders(windowStart, windowEnd);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const scheduledClass of classes) {
    const recipientIds = new Set<string>(scheduledClass.participantUserIds);
    if (scheduledClass.teacherId) {
      recipientIds.add(scheduledClass.teacherId);
    }

    const recipients = await getUsersByIds(Array.from(recipientIds));
    for (const recipient of recipients) {
      if (
        alreadySent(scheduledClass.reminders, recipient.id, ReminderChannel.EMAIL) &&
        alreadySent(scheduledClass.reminders, recipient.id, ReminderChannel.WHATSAPP)
      ) {
        skipped += 2;
        continue;
      }

      if (!alreadySent(scheduledClass.reminders, recipient.id, ReminderChannel.EMAIL)) {
        const emailResult = await sendClassReminderEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.fullName,
          classTitle: scheduledClass.title,
          startAt: scheduledClass.startAt,
          endAt: scheduledClass.endAt,
          liveLessonUrl: scheduledClass.liveLessonUrl,
        });

        await createReminderLog({
          scheduledClassId: scheduledClass.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          channel: "EMAIL",
          status: emailResult.delivered ? "SENT" : "FAILED",
          details: emailResult.delivered ? "Email sent." : emailResult.reason,
        });

        if (emailResult.delivered) {
          sent += 1;
        } else {
          failed += 1;
        }
      }

      if (!alreadySent(scheduledClass.reminders, recipient.id, ReminderChannel.WHATSAPP)) {
        const whatsappResult = await sendWhatsAppReminder({
          phone: recipient.phoneWhatsapp,
          recipientName: recipient.fullName,
          classTitle: scheduledClass.title,
          startAt: scheduledClass.startAt,
          liveLessonUrl: scheduledClass.liveLessonUrl,
        });

        await createReminderLog({
          scheduledClassId: scheduledClass.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          channel: "WHATSAPP",
          status: whatsappResult.delivered ? "SENT" : "SKIPPED",
          details: whatsappResult.delivered ? "WhatsApp reminder sent." : whatsappResult.reason,
        });

        if (whatsappResult.delivered) {
          sent += 1;
        } else {
          skipped += 1;
        }
      }
    }
  }

  return {
    scannedClasses: classes.length,
    sent,
    failed,
    skipped,
  };
}
