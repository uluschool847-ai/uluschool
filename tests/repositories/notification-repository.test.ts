import { NotificationType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  assignmentReminderLog: {
    findMany: vi.fn(),
  },
  inAppNotification: {
    count: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  notificationPreference: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  reminderLog: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

function loadRepository() {
  const specifier = "@/lib/repositories/notification-repository";
  return import(/* @vite-ignore */ specifier) as Promise<
    typeof import("@/lib/repositories/notification-repository")
  >;
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    body: "Body",
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    dedupeKey: "lesson:1",
    deliveryStatus: "SENT",
    details: null,
    id: "notification-1",
    readAt: null,
    recipientUserId: "student-1",
    relatedHref: "/portal/student/schedule",
    sourceReminderLogId: null,
    title: "Upcoming lesson reminder",
    type: NotificationType.LESSON_REMINDER,
    ...overrides,
  };
}

describe("notification repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists only notifications scoped to the recipient and blocks unsafe hrefs", async () => {
    prismaMock.inAppNotification.findMany.mockResolvedValue([
      notification({ relatedHref: "javascript:alert(1)" }),
    ]);
    const { listNotificationsForUser } = await loadRepository();

    const rows = await listNotificationsForUser("student-1", { status: "unread" });

    expect(prismaMock.inAppNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          readAt: null,
          recipientUserId: "student-1",
        }),
      }),
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        isRead: false,
        relatedHref: null,
        title: "Upcoming lesson reminder",
      }),
    );
  });

  it("upserts in-app notifications using a recipient dedupe key", async () => {
    const { createInAppNotification } = await loadRepository();

    await createInAppNotification({
      body: "Assignment is overdue.",
      dedupeKey: "assignment:1:2026-06-01",
      recipientUserId: "student-1",
      relatedHref: "/portal/student/assignments/assignment-1",
      title: "Overdue assignment reminder",
      type: NotificationType.ASSIGNMENT_OVERDUE,
    });

    expect(prismaMock.inAppNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipientUserId_dedupeKey: {
            dedupeKey: "assignment:1:2026-06-01",
            recipientUserId: "student-1",
          },
        },
      }),
    );
  });

  it("stores email and WhatsApp preferences without disabling in-app notifications", async () => {
    const { updateNotificationPreference } = await loadRepository();

    await updateNotificationPreference("parent-1", {
      emailEnabled: false,
      whatsappEnabled: true,
    });

    expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          emailEnabled: false,
          whatsappEnabled: true,
        },
      }),
    );
  });
});
