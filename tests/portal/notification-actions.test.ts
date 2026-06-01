import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const markNotificationReadForUserMock = vi.hoisted(() => vi.fn());
const updateNotificationPreferenceMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/notification-repository", () => ({
  markNotificationReadForUser: markNotificationReadForUserMock,
  updateNotificationPreference: updateNotificationPreferenceMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type NotificationActionsModule = {
  markNotificationReadAction: (formData: FormData) => Promise<void>;
  updateNotificationPreferencesAction: (formData: FormData) => Promise<void>;
};

function loadNotificationActions() {
  const specifier = "@/app/portal/actions/notification-actions";
  return import(/* @vite-ignore */ specifier) as Promise<NotificationActionsModule>;
}

describe("portal notification actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    markNotificationReadForUserMock.mockResolvedValue({ count: 1 });
    updateNotificationPreferenceMock.mockResolvedValue({});
  });

  it("marks a notification read using the signed-in user id", async () => {
    const formData = new FormData();
    formData.set("notificationId", "notification-1");
    formData.set("recipientUserId", "spoofed-user");

    const { markNotificationReadAction } = await loadNotificationActions();
    await markNotificationReadAction(formData);

    expect(requireRoleMock).toHaveBeenCalledWith([
      UserRole.STUDENT,
      UserRole.PARENT,
      UserRole.TEACHER,
    ]);
    expect(markNotificationReadForUserMock).toHaveBeenCalledWith("student-1", "notification-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student/notifications");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  });

  it("does not mutate or revalidate when notification id validation fails", async () => {
    const formData = new FormData();
    formData.set("notificationId", "   ");

    const { markNotificationReadAction } = await loadNotificationActions();
    await markNotificationReadAction(formData);

    expect(markNotificationReadForUserMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updates reminder preferences for the signed-in parent only", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-1", role: UserRole.PARENT });
    const formData = new FormData();
    formData.set("whatsappEnabled", "on");

    const { updateNotificationPreferencesAction } = await loadNotificationActions();
    await updateNotificationPreferencesAction(formData);

    expect(updateNotificationPreferenceMock).toHaveBeenCalledWith("parent-1", {
      emailEnabled: false,
      whatsappEnabled: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent/notifications");
  });

  it("rejects unsupported roles before notification mutations", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/portal/unauthorized"));
    const formData = new FormData();
    formData.set("notificationId", "notification-1");

    const { markNotificationReadAction } = await loadNotificationActions();

    await expect(markNotificationReadAction(formData)).rejects.toThrow("NEXT_REDIRECT");
    expect(markNotificationReadForUserMock).not.toHaveBeenCalled();
    expect(updateNotificationPreferenceMock).not.toHaveBeenCalled();
  });
});
