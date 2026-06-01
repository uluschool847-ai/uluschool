import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { NotificationInbox } from "@/components/portal/notification-inbox";
import { requireRole } from "@/lib/auth/session";
import {
  getNotificationPreference,
  listNotificationsForUser,
} from "@/lib/repositories/notification-repository";

export const metadata: Metadata = {
  title: "Parent Notifications - mathSchool",
};

function pickNotificationFilters(params: { status?: string; type?: string }) {
  return {
    status: params.status,
    type: params.type,
  };
}

export default async function ParentNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; type?: string }>;
}) {
  const session = await requireRole([UserRole.PARENT]);
  const params = (await searchParams) ?? {};
  const filters = pickNotificationFilters(params);
  const [notifications, preferences] = await Promise.all([
    listNotificationsForUser(session.uid, filters),
    getNotificationPreference(session.uid),
  ]);

  return (
    <NotificationInbox
      backHref="/portal/parent"
      emailEnabled={preferences.emailEnabled}
      notifications={notifications}
      title="Parent Notifications"
      whatsappEnabled={preferences.whatsappEnabled}
    />
  );
}
