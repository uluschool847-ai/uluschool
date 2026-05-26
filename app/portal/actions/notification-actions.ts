"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import {
  markNotificationReadForUser,
  updateNotificationPreference,
} from "@/lib/repositories/notification-repository";

function portalPath(role: UserRole) {
  if (role === UserRole.TEACHER) return "/portal/teacher/notifications";
  if (role === UserRole.PARENT) return "/portal/parent/notifications";
  return "/portal/student/notifications";
}

export async function markNotificationReadAction(formData: FormData) {
  const session = await requireRole([UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER]);
  const notificationId = formData.get("notificationId")?.toString() ?? "";
  if (!notificationId) return;

  await markNotificationReadForUser(session.uid, notificationId);
  revalidatePath(portalPath(session.role as UserRole));
  revalidatePath(`/portal/${String(session.role).toLowerCase()}`);
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const session = await requireRole([UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER]);
  await updateNotificationPreference(session.uid, {
    emailEnabled: formData.get("emailEnabled") === "on",
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
  });
  revalidatePath(portalPath(session.role as UserRole));
}
