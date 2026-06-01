"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  markNotificationReadForUser,
  updateNotificationPreference,
} from "@/lib/repositories/notification-repository";

const markNotificationReadSchema = z.object({
  notificationId: z.string().trim().min(1).max(200),
});

const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
});

function portalPath(role: UserRole) {
  if (role === UserRole.TEACHER) return "/portal/teacher/notifications";
  if (role === UserRole.PARENT) return "/portal/parent/notifications";
  return "/portal/student/notifications";
}

export async function markNotificationReadAction(formData: FormData) {
  const session = await requireRole([UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER]);
  const parsed = markNotificationReadSchema.safeParse({
    notificationId: formData.get("notificationId")?.toString() ?? "",
  });
  if (!parsed.success) return;

  await markNotificationReadForUser(session.uid, parsed.data.notificationId);
  revalidatePath(portalPath(session.role as UserRole));
  revalidatePath(`/portal/${String(session.role).toLowerCase()}`);
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const session = await requireRole([UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER]);
  const preferences = notificationPreferencesSchema.parse({
    emailEnabled: formData.get("emailEnabled") === "on",
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
  });
  await updateNotificationPreference(session.uid, preferences);
  revalidatePath(portalPath(session.role as UserRole));
}
