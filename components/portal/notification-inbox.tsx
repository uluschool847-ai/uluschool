import { NotificationType } from "@prisma/client";
import Link from "next/link";

import {
  markNotificationReadAction,
  updateNotificationPreferencesAction,
} from "@/app/portal/actions/notification-actions";
import type { NotificationRow } from "@/lib/repositories/notification-repository";

function formatDateTime(date: Date | string) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(value);
}

function typeLabel(type: NotificationType) {
  switch (type) {
    case NotificationType.ASSIGNMENT_OVERDUE:
      return "Overdue assignment";
    case NotificationType.LESSON_REMINDER:
      return "Lesson reminder";
    case NotificationType.GRADE_FEEDBACK:
      return "Grade feedback";
    case NotificationType.ATTENDANCE_ALERT:
      return "Attendance alert";
    case NotificationType.REPORT_READY:
      return "Report ready";
    default:
      return "System notice";
  }
}

export function NotificationInbox({
  backHref,
  emailEnabled,
  notifications,
  title,
  whatsappEnabled,
}: {
  backHref: string;
  emailEnabled: boolean;
  notifications: NotificationRow[];
  title: string;
  whatsappEnabled: boolean;
}) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          In-app notifications are always available locally. Email and WhatsApp toggles affect
          reminder dispatch only.
        </p>
        <Link className="text-sm font-medium text-primary" href={backHref}>
          Back to dashboard
        </Link>
      </header>

      <section
        className="rounded-lg border border-secondary p-4"
        aria-label="Notification preferences"
      >
        <h2 className="text-xl font-semibold">Notification preferences</h2>
        <form
          action={updateNotificationPreferencesAction}
          className="mt-3 flex flex-wrap gap-4 text-sm"
        >
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="emailEnabled" defaultChecked={emailEnabled} />
            Email reminders
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="whatsappEnabled" defaultChecked={whatsappEnabled} />
            WhatsApp reminders
          </label>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
            type="submit"
          >
            Save preferences
          </button>
        </form>
      </section>

      <section className="space-y-3" aria-label="Notification list">
        {notifications.length === 0 ? (
          <output className="block rounded-lg border border-dashed border-secondary p-4 text-sm text-muted-foreground">
            No notifications yet.
          </output>
        ) : (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className="space-y-3 rounded-lg border border-secondary bg-background p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {typeLabel(notification.type)} · {notification.isRead ? "Read" : "Unread"} ·{" "}
                    {notification.deliveryStatus}
                  </p>
                  <h2 className="text-lg font-semibold">{notification.title}</h2>
                  <p className="text-sm text-muted-foreground">{notification.body}</p>
                  <p className="text-xs text-muted-foreground">
                    Created: {formatDateTime(notification.createdAt)}
                  </p>
                  {notification.details ? (
                    <p className="text-xs text-muted-foreground">Details: {notification.details}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {notification.relatedHref ? (
                    <Link
                      className="rounded-md border border-secondary px-3 py-1.5 text-sm font-medium"
                      href={notification.relatedHref}
                    >
                      Open related item
                    </Link>
                  ) : null}
                  {!notification.isRead ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <button
                        className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium"
                        type="submit"
                      >
                        Mark as read
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
