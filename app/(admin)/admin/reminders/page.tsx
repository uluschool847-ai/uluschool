import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { ReminderDispatchControls } from "@/components/admin/reminders/ReminderDispatchControls";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { listAdminReminderLogs } from "@/lib/repositories/notification-repository";

export const metadata: Metadata = {
  title: "Reminder Logs - Admin",
  robots: { index: false, follow: false },
};

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Kiev",
  }).format(date);
}

export default async function AdminReminderLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ channel?: string; status?: string; type?: string }>;
}) {
  await requireRole([UserRole.ADMIN]);
  const params = (await searchParams) ?? {};
  const logs = await listAdminReminderLogs(params);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Reminder Logs</h1>
        <p className="text-sm text-muted-foreground">
          Delivery status for lesson and assignment reminders.
        </p>
        <Link className="text-sm font-medium text-primary" href="/admin">
          Back to admin dashboard
        </Link>
      </header>

      <section className="rounded-lg border border-secondary p-4" aria-label="Reminder controls">
        <h2 className="text-xl font-semibold">Manual run</h2>
        <div className="mt-3">
          <ReminderDispatchControls />
        </div>
      </section>

      <form className="grid gap-3 rounded-lg border border-secondary p-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm">
          Type
          <select name="type" defaultValue={params.type ?? "all"} className="rounded-md border p-2">
            <option value="all">All</option>
            <option value="lesson">Lesson</option>
            <option value="assignment">Assignment</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Channel
          <select
            name="channel"
            defaultValue={params.channel ?? "all"}
            className="rounded-md border p-2"
          >
            <option value="all">All</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            name="status"
            defaultValue={params.status ?? "all"}
            className="rounded-md border p-2"
          >
            <option value="all">All</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </form>

      <section className="space-y-3" aria-label="Reminder log list">
        {logs.length === 0 ? (
          <output className="block rounded-lg border border-dashed border-secondary p-4 text-sm text-muted-foreground">
            No reminder logs found.
          </output>
        ) : (
          logs.map((log) => (
            <article
              key={`${log.type}-${log.id}`}
              className="rounded-lg border border-secondary p-4"
            >
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p>
                  <strong>Type:</strong> {log.type}
                </p>
                <p>
                  <strong>Status:</strong> {log.status}
                </p>
                <p>
                  <strong>Channel:</strong> {log.channel}
                </p>
                <p>
                  <strong>Recipient:</strong> {log.recipientEmail}
                </p>
                <p>
                  <strong>Target:</strong> {log.targetTitle}
                </p>
                <p>
                  <strong>Target time:</strong> {formatDateTime(log.targetWhen)}
                </p>
                <p>
                  <strong>Created:</strong> {formatDateTime(log.createdAt)}
                </p>
                <p>
                  <strong>Details:</strong> {log.details ?? "None"}
                </p>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
