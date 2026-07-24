import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import { NotificationType, PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.student-notifications.";
const NOTIFICATION_PREFIX = "QA Student Notifications";

type StudentNotificationsFixture = {
  foreignNotificationTitle: string;
  notificationTitle: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
};

let fixture: StudentNotificationsFixture;

async function setStudentSession(page: Page) {
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
        email: fixture.studentEmail,
        fullName: fixture.studentName,
        role: UserRole.STUDENT,
        uid: fixture.studentId,
      }),
    },
  ]);
}

test.describe("Student notifications portal", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student manages only their own notification inbox and preferences", async ({ page }) => {
    await setStudentSession(page);

    await page.goto(
      `${BASE_URL}/portal/student/notifications?status=unread&type=${NotificationType.LESSON_REMINDER}&studentId=spoofed-student`,
    );
    await expect(
      page.getByRole("heading", { exact: true, name: "Student Notifications" }),
    ).toBeVisible();
    await expect(page.getByText(fixture.notificationTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignNotificationTitle)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /open related item/i })).toHaveAttribute(
      "href",
      "/portal/student/schedule",
    );

    await page.getByRole("button", { name: /mark as read/i }).click();
    await expect
      .poll(async () => {
        const notification = await prisma.inAppNotification.findFirst({
          where: { recipientUserId: fixture.studentId, title: fixture.notificationTitle },
          select: { readAt: true },
        });
        return Boolean(notification?.readAt);
      })
      .toBe(true);

    await page.goto(`${BASE_URL}/portal/student/notifications`);
    await expect(page.getByText(fixture.notificationTitle)).toBeVisible();
    await page.getByLabel(/email reminders/i).uncheck();
    await page.getByLabel(/whatsapp reminders/i).check();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect
      .poll(async () => {
        const preference = await prisma.notificationPreference.findUnique({
          where: { userId: fixture.studentId },
          select: { emailEnabled: true, whatsappEnabled: true },
        });
        return `${preference?.emailEnabled}:${preference?.whatsappEnabled}`;
      })
      .toBe("false:true");
  });
});

async function createFixtures(): Promise<StudentNotificationsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentName = `${NOTIFICATION_PREFIX} Student ${suffix}`;
  const foreignStudentName = `${NOTIFICATION_PREFIX} Foreign Student ${suffix}`;
  const notificationTitle = `${NOTIFICATION_PREFIX} Reminder ${suffix}`;
  const foreignNotificationTitle = `${NOTIFICATION_PREFIX} Foreign Reminder ${suffix}`;

  const [student, foreignStudent] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}student.${suffix}@example.com`,
        fullName: studentName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}foreign-student.${suffix}@example.com`,
        fullName: foreignStudentName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
  ]);

  await Promise.all([
    prisma.inAppNotification.create({
      data: {
        body: "Your algebra lesson starts soon.",
        dedupeKey: `student-notifications-owned-${suffix}`,
        details: "Algebra Group A",
        recipientUserId: student.id,
        relatedHref: "/portal/student/schedule",
        title: notificationTitle,
        type: NotificationType.LESSON_REMINDER,
      },
    }),
    prisma.inAppNotification.create({
      data: {
        body: "A different student reminder.",
        dedupeKey: `student-notifications-foreign-${suffix}`,
        details: "Algebra Group B",
        recipientUserId: foreignStudent.id,
        relatedHref: "/portal/student/schedule",
        title: foreignNotificationTitle,
        type: NotificationType.LESSON_REMINDER,
      },
    }),
    prisma.notificationPreference.create({
      data: {
        emailEnabled: true,
        userId: student.id,
        whatsappEnabled: false,
      },
    }),
  ]);

  return {
    foreignNotificationTitle,
    notificationTitle,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
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
