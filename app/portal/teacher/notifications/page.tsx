import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { NotificationInbox } from "@/components/portal/notification-inbox";
import { requireRole } from "@/lib/auth/session";
import {
  getNotificationPreference,
  listNotificationsForUser,
} from "@/lib/repositories/notification-repository";

export const metadata: Metadata = {
  title: "Teacher Notifications - mathSchool",
};

export default async function TeacherNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; type?: string }>;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = (await searchParams) ?? {};
  const [notifications, preferences] = await Promise.all([
    listNotificationsForUser(session.uid, params),
    getNotificationPreference(session.uid),
  ]);

  return (
    <NotificationInbox
      backHref="/portal/teacher"
      emailEnabled={preferences.emailEnabled}
      notifications={notifications}
      title="Teacher Notifications"
      whatsappEnabled={preferences.whatsappEnabled}
    />
  );
}
