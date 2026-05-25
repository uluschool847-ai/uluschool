import { ReminderChannel, type ReminderDeliveryStatus } from "@prisma/client";

import {
  REMINDER_MEETING_LINK_PLACEHOLDER,
  validateLiveLessonUrl,
} from "@/lib/lessons/live-lesson-url";
import {
  createReminderLog,
  listUpcomingClassesForReminders,
} from "@/lib/repositories/schedule-repository";
import {
  createAssignmentReminderLog,
  listMissingAssignmentsForReminders,
} from "@/lib/repositories/submission-repository";
import { getUsersByIds } from "@/lib/repositories/user-repository";
import { siteConfig } from "@/lib/seo";
import { sendAssignmentReminderEmail, sendClassReminderEmail } from "@/lib/services/email";

async function sendWhatsAppReminder(input: {
  phone: string | null;
  recipientName: string;
  classTitle: string;
  startAt: Date;
  liveLessonUrl: string;
}) {
  const webhook = process.env.WHATSAPP_WEBHOOK_URL ?? "";
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

async function sendWhatsAppAssignmentReminder(input: {
  phone: string | null;
  recipientName: string;
  assignmentTitle: string;
  dueDate: Date;
  assignmentHref: string;
}) {
  const webhook = process.env.WHATSAPP_WEBHOOK_URL ?? "";
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
        template: "assignment_reminder",
        data: {
          recipientName: input.recipientName,
          assignmentTitle: input.assignmentTitle,
          dueDate: input.dueDate.toISOString(),
          assignmentHref: input.assignmentHref,
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
    reminderWindowStart?: Date | null;
    reminderWindowEnd?: Date | null;
  }>,
  userId: string,
  channel: ReminderChannel,
  reminderWindowStart: Date,
  reminderWindowEnd: Date,
) {
  return recentLogs.some(
    (log) =>
      log.recipientUserId === userId &&
      log.channel === channel &&
      log.status === "SENT" &&
      log.reminderWindowStart?.getTime() === reminderWindowStart.getTime() &&
      log.reminderWindowEnd?.getTime() === reminderWindowEnd.getTime(),
  );
}

function reminderLiveLessonUrl(input: {
  liveLessonUrl?: string | null;
  meetingProvider?: string | null;
}) {
  const validation = validateLiveLessonUrl(
    input.liveLessonUrl,
    input.meetingProvider ?? "MANUAL_URL",
    {
      required: false,
    },
  );

  return validation.ok && validation.url ? validation.url : REMINDER_MEETING_LINK_PLACEHOLDER;
}

function assignmentReminderWindow(now: Date) {
  const reminderWindowStart = new Date(now);
  reminderWindowStart.setUTCHours(0, 0, 0, 0);
  const reminderWindowEnd = new Date(now);
  reminderWindowEnd.setUTCHours(23, 59, 59, 999);
  return { reminderWindowStart, reminderWindowEnd };
}

function assignmentHref(assignmentId: string) {
  return new URL(`/portal/student/assignments/${assignmentId}`, siteConfig.url).toString();
}

export async function processDueReminders() {
  const now = new Date();
  const windowStart = now;
  const windowEnd = new Date(Date.now() + 1000 * 60 * 60 * 24);

  const classes = await listUpcomingClassesForReminders(windowStart, windowEnd);
  const assignments = await listMissingAssignmentsForReminders(now);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const scheduledClass of classes) {
    if (
      !["SCHEDULED", "LIVE", "RESCHEDULED"].includes(
        "status" in scheduledClass ? String(scheduledClass.status) : "SCHEDULED",
      )
    ) {
      skipped += 1;
      continue;
    }

    const reminderWindowStart = new Date(
      scheduledClass.startAt.getTime() - scheduledClass.reminderMinutesBefore * 60_000,
    );
    const reminderWindowEnd = scheduledClass.startAt;
    if (now < reminderWindowStart || now > reminderWindowEnd) {
      skipped += 1;
      continue;
    }

    const recipientIds = new Set<string>(scheduledClass.students.map((student) => student.id));
    if (scheduledClass.teacherId) {
      recipientIds.add(scheduledClass.teacherId);
    }
    if (scheduledClass.classGroup?.teacherId) {
      recipientIds.add(scheduledClass.classGroup.teacherId);
    }
    for (const student of scheduledClass.classGroup?.students ?? []) {
      recipientIds.add(student.id);
    }

    const recipients = await getUsersByIds(Array.from(recipientIds));
    const liveLessonUrl = reminderLiveLessonUrl(scheduledClass);
    for (const recipient of recipients) {
      if (
        alreadySent(
          scheduledClass.reminders,
          recipient.id,
          ReminderChannel.EMAIL,
          reminderWindowStart,
          reminderWindowEnd,
        ) &&
        alreadySent(
          scheduledClass.reminders,
          recipient.id,
          ReminderChannel.WHATSAPP,
          reminderWindowStart,
          reminderWindowEnd,
        )
      ) {
        skipped += 2;
        continue;
      }

      if (
        !alreadySent(
          scheduledClass.reminders,
          recipient.id,
          ReminderChannel.EMAIL,
          reminderWindowStart,
          reminderWindowEnd,
        )
      ) {
        const emailResult = await sendClassReminderEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.fullName,
          classTitle: scheduledClass.title,
          startAt: scheduledClass.startAt,
          endAt: scheduledClass.endAt,
          liveLessonUrl,
        });

        await createReminderLog({
          scheduledClassId: scheduledClass.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          channel: "EMAIL",
          status: emailResult.delivered ? "SENT" : "FAILED",
          details: emailResult.delivered ? "Email sent." : emailResult.reason,
          reminderWindowStart,
          reminderWindowEnd,
        });

        if (emailResult.delivered) {
          sent += 1;
        } else {
          failed += 1;
        }
      }

      if (
        !alreadySent(
          scheduledClass.reminders,
          recipient.id,
          ReminderChannel.WHATSAPP,
          reminderWindowStart,
          reminderWindowEnd,
        )
      ) {
        const whatsappResult = await sendWhatsAppReminder({
          phone: recipient.phoneWhatsapp,
          recipientName: recipient.fullName,
          classTitle: scheduledClass.title,
          startAt: scheduledClass.startAt,
          liveLessonUrl,
        });

        await createReminderLog({
          scheduledClassId: scheduledClass.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          channel: "WHATSAPP",
          status: whatsappResult.delivered ? "SENT" : "SKIPPED",
          details: whatsappResult.delivered ? "WhatsApp reminder sent." : whatsappResult.reason,
          reminderWindowStart,
          reminderWindowEnd,
        });

        if (whatsappResult.delivered) {
          sent += 1;
        } else {
          skipped += 1;
        }
      }
    }
  }

  const { reminderWindowStart, reminderWindowEnd } = assignmentReminderWindow(now);
  for (const assignment of assignments) {
    const recipientIds = assignment.recipients.map((recipient) => recipient.id);
    if (recipientIds.length === 0) {
      skipped += 1;
      continue;
    }

    const recipients = await getUsersByIds(recipientIds);
    const href = assignmentHref(assignment.id);

    for (const recipient of recipients) {
      if (
        alreadySent(
          assignment.reminders,
          recipient.id,
          ReminderChannel.EMAIL,
          reminderWindowStart,
          reminderWindowEnd,
        ) &&
        alreadySent(
          assignment.reminders,
          recipient.id,
          ReminderChannel.WHATSAPP,
          reminderWindowStart,
          reminderWindowEnd,
        )
      ) {
        skipped += 2;
        continue;
      }

      if (
        !alreadySent(
          assignment.reminders,
          recipient.id,
          ReminderChannel.EMAIL,
          reminderWindowStart,
          reminderWindowEnd,
        )
      ) {
        const emailResult = await sendAssignmentReminderEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.fullName,
          assignmentTitle: assignment.title,
          dueDate: assignment.dueDate,
          assignmentHref: href,
        });

        await createAssignmentReminderLog({
          assignmentId: assignment.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          channel: "EMAIL",
          status: emailResult.delivered ? "SENT" : "FAILED",
          details: emailResult.delivered ? "Email sent." : emailResult.reason,
          reminderWindowStart,
          reminderWindowEnd,
        });

        if (emailResult.delivered) {
          sent += 1;
        } else {
          failed += 1;
        }
      }

      if (
        !alreadySent(
          assignment.reminders,
          recipient.id,
          ReminderChannel.WHATSAPP,
          reminderWindowStart,
          reminderWindowEnd,
        )
      ) {
        const whatsappResult = await sendWhatsAppAssignmentReminder({
          phone: recipient.phoneWhatsapp,
          recipientName: recipient.fullName,
          assignmentTitle: assignment.title,
          dueDate: assignment.dueDate,
          assignmentHref: href,
        });

        await createAssignmentReminderLog({
          assignmentId: assignment.id,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          channel: "WHATSAPP",
          status: whatsappResult.delivered ? "SENT" : "SKIPPED",
          details: whatsappResult.delivered ? "WhatsApp reminder sent." : whatsappResult.reason,
          reminderWindowStart,
          reminderWindowEnd,
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
    scannedAssignments: assignments.length,
    scannedClasses: classes.length,
    sent,
    failed,
    skipped,
  };
}
