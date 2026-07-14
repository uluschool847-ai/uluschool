import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import { NotificationType, PrismaClient, UserRole } from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.parent-notifications.";
const NOTIFICATION_PREFIX = "QA Parent Notifications";

type ParentNotificationsFixture = {
  foreignNotificationTitle: string;
  notificationTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
};

let fixture: ParentNotificationsFixture;

async function setParentSession(page: Page) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      domain: COOKIE_DOMAIN,
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      name: "ulu_session",
      path: "/",
      sameSite: "Lax",
      value: await createSessionToken({
        email: fixture.parentEmail,
        fullName: fixture.parentName,
        role: UserRole.PARENT,
        uid: fixture.parentId,
      }),
    },
  ]);
}

test.describe("Parent notifications portal", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent manages only their own notification inbox and preferences", async ({ page }) => {
    await setParentSession(page);

    await page.goto(
      `${BASE_URL}/portal/parent/notifications?status=unread&type=${NotificationType.LESSON_REMINDER}&parentId=spoofed-parent&studentId=foreign-child`,
    );
    await expect(
      page.getByRole("heading", { exact: true, name: "Parent Notifications" }),
    ).toBeVisible();
    await expect(page.getByText(fixture.notificationTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignNotificationTitle)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /open related item/i })).toHaveAttribute(
      "href",
      "/portal/parent/schedule",
    );

    await page.getByRole("button", { name: /mark as read/i }).click();
    await expect
      .poll(async () => {
        const notification = await prisma.inAppNotification.findFirst({
          where: { recipientUserId: fixture.parentId, title: fixture.notificationTitle },
          select: { readAt: true },
        });
        return Boolean(notification?.readAt);
      })
      .toBe(true);

    await page.goto(`${BASE_URL}/portal/parent/notifications`);
    await expect(page.getByText(fixture.notificationTitle)).toBeVisible();
    await page.getByLabel(/email reminders/i).uncheck();
    await page.getByLabel(/whatsapp reminders/i).check();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect
      .poll(async () => {
        const preference = await prisma.notificationPreference.findUnique({
          where: { userId: fixture.parentId },
          select: { emailEnabled: true, whatsappEnabled: true },
        });
        return `${preference?.emailEnabled}:${preference?.whatsappEnabled}`;
      })
      .toBe("false:true");
  });
});

async function createFixtures(): Promise<ParentNotificationsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentName = `${NOTIFICATION_PREFIX} Parent ${suffix}`;
  const foreignParentName = `${NOTIFICATION_PREFIX} Foreign Parent ${suffix}`;
  const notificationTitle = `${NOTIFICATION_PREFIX} Reminder ${suffix}`;
  const foreignNotificationTitle = `${NOTIFICATION_PREFIX} Foreign Reminder ${suffix}`;

  const [parent, foreignParent] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}parent.${suffix}@example.com`,
        fullName: parentName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.PARENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}foreign-parent.${suffix}@example.com`,
        fullName: foreignParentName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.PARENT,
      },
    }),
  ]);

  await Promise.all([
    prisma.inAppNotification.create({
      data: {
        body: "Your child has an algebra lesson soon.",
        dedupeKey: `parent-notifications-owned-${suffix}`,
        details: "Algebra Group A",
        recipientUserId: parent.id,
        relatedHref: "/portal/parent/schedule",
        title: notificationTitle,
        type: NotificationType.LESSON_REMINDER,
      },
    }),
    prisma.inAppNotification.create({
      data: {
        body: "A different parent reminder.",
        dedupeKey: `parent-notifications-foreign-${suffix}`,
        details: "Algebra Group B",
        recipientUserId: foreignParent.id,
        relatedHref: "/portal/parent/schedule",
        title: foreignNotificationTitle,
        type: NotificationType.LESSON_REMINDER,
      },
    }),
    prisma.notificationPreference.create({
      data: {
        emailEnabled: true,
        userId: parent.id,
        whatsappEnabled: false,
      },
    }),
  ]);

  return {
    foreignNotificationTitle,
    notificationTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
  };
}

async function cleanupFixtures() {
  const users = await prisma.appUser.findMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) return;

  await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.inAppNotification.deleteMany({ where: { recipientUserId: { in: userIds } } });
  await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
}
