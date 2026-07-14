import { type Page, expect, test } from "@playwright/test";
import { Prisma, UserRole } from "@prisma/client";

import { createSessionToken } from "@/e2e/helpers/session";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_PREFIX = `QA Audit ${RUN_ID}`;
const ADMIN_EMAIL = `qa.audit.admin.${RUN_ID}@example.com`;
const STUDENT_EMAIL = `qa.audit.student.${RUN_ID}@example.com`;
const TEACHER_EMAIL = `qa.audit.teacher.${RUN_ID}@example.com`;
const PARENT_EMAIL = `qa.audit.parent.${RUN_ID}@example.com`;
const DELETED_ADMIN_EMAIL = `qa.audit.deleted-admin.${RUN_ID}@example.com`;

let adminUserId = "";
let studentUserId = "";
let teacherUserId = "";
let parentUserId = "";

function testMeetUrl(path: string) {
  return `https://meet.example.com/${path}`;
}

async function setPortalSession(
  page: Page,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
  },
) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "ulu_session",
      value: await createSessionToken(input),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

async function cleanupQaAuditData() {
  await prisma.adminAuditLog.deleteMany({
    where: {
      OR: [
        {
          adminUser: {
            email: {
              in: [ADMIN_EMAIL, STUDENT_EMAIL, TEACHER_EMAIL, PARENT_EMAIL, DELETED_ADMIN_EMAIL],
            },
          },
        },
        { targetId: { startsWith: QA_PREFIX } },
      ],
    },
  });
  await prisma.appUser.deleteMany({
    where: {
      email: { in: [ADMIN_EMAIL, STUDENT_EMAIL, TEACHER_EMAIL, PARENT_EMAIL, DELETED_ADMIN_EMAIL] },
    },
  });
}

async function createAuditFixtures() {
  const passwordHash = await hashPassword(PASSWORD);
  const [admin, student, teacher, parent] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: ADMIN_EMAIL,
        fullName: `${QA_PREFIX} Admin`,
        role: UserRole.ADMIN,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: STUDENT_EMAIL,
        fullName: `${QA_PREFIX} Student`,
        role: UserRole.STUDENT,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: TEACHER_EMAIL,
        fullName: `${QA_PREFIX} Teacher`,
        role: UserRole.TEACHER,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: PARENT_EMAIL,
        fullName: `${QA_PREFIX} Parent`,
        role: UserRole.PARENT,
        passwordHash,
        isActive: true,
      },
    }),
  ]);

  adminUserId = admin.id;
  studentUserId = student.id;
  teacherUserId = teacher.id;
  parentUserId = parent.id;

  const now = Date.now();
  const actorSnapshot = {
    adminUserId: admin.id,
    actorId: admin.id,
    actorEmail: admin.email,
    actorFullName: admin.fullName,
    actorRole: admin.role,
  };
  await prisma.adminAuditLog.createMany({
    data: [
      {
        ...actorSnapshot,
        action: "APP_USER_CREATED",
        targetType: "app_user",
        targetId: `${QA_PREFIX} app-user`,
        before: Prisma.JsonNull,
        after: {
          email: "created@example.com",
          fullName: "Created User",
          passwordHash: "[REDACTED]",
        },
        createdAt: new Date(now + 1000),
      },
      {
        ...actorSnapshot,
        action: "APP_USER_ROLE_UPDATED",
        targetType: "app_user",
        targetId: `${QA_PREFIX} role-user`,
        before: { role: "STUDENT" },
        after: { role: "TEACHER" },
        createdAt: new Date(now + 900),
      },
      {
        ...actorSnapshot,
        action: "APP_USER_STATUS_UPDATED",
        targetType: "app_user",
        targetId: `${QA_PREFIX} status-user`,
        before: { isActive: true },
        after: { isActive: false },
        createdAt: new Date(now + 800),
      },
      {
        ...actorSnapshot,
        action: "TEACHER_PROFILE_UPDATED",
        targetType: "teacher",
        targetId: `${QA_PREFIX} teacher`,
        before: { title: "Old Title" },
        after: { title: "New Title", subjects: ["Math", "Physics"] },
        createdAt: new Date(now + 700),
      },
      {
        ...actorSnapshot,
        action: "STUDENT_LEARNING_STATUS_UPDATED",
        targetType: "student",
        targetId: `${QA_PREFIX} student`,
        before: { learningStatus: "ACTIVE" },
        after: { learningStatus: "PAUSED" },
        createdAt: new Date(now + 600),
      },
      {
        ...actorSnapshot,
        action: "PARENT_STUDENT_LINKED",
        targetType: "parent",
        targetId: `${QA_PREFIX} parent`,
        before: { studentId: null },
        after: { studentId: `${QA_PREFIX} student` },
        createdAt: new Date(now + 500),
      },
      {
        ...actorSnapshot,
        action: "scheduled_class.create",
        targetType: "scheduled_class",
        targetId: `${QA_PREFIX} class`,
        before: Prisma.JsonNull,
        after: {
          title: "Audit Class",
          startAt: "2026-05-20T10:00:00.000Z",
          endAt: "2026-05-20T11:00:00.000Z",
          liveLessonUrl: testMeetUrl("audit"),
        },
        createdAt: new Date(now + 400),
      },
      {
        ...actorSnapshot,
        action: "PAYMENT_STATUS_UPDATED",
        targetType: "payment_transaction",
        targetId: `${QA_PREFIX} payment`,
        before: { status: "PENDING" },
        after: { status: "SUCCESS" },
        meta: { paymentId: `${QA_PREFIX} payment`, studentId: `${QA_PREFIX} student` },
        createdAt: new Date(now + 300),
      },
      {
        ...actorSnapshot,
        action: "ADMIN_2FA_ENABLED",
        targetType: "AppUser",
        targetId: `${QA_PREFIX} admin-security`,
        before: { twoFactorEnabled: false },
        after: { twoFactorEnabled: true },
        meta: { note: "security audit smoke" },
        createdAt: new Date(now + 200),
      },
      {
        ...actorSnapshot,
        action: "APP_USER_CREATED",
        targetType: "app_user",
        targetId: `${QA_PREFIX} sensitive`,
        before: Prisma.JsonNull,
        after: {
          email: "sensitive@example.com",
          passwordHash: "[REDACTED]",
          ["twoFactor" + "Secret"]: "[REDACTED]",
          backupCodes: "[REDACTED]",
          longNote: "unicode check Добрий день ".repeat(20),
        },
        createdAt: new Date(now + 100),
      },
      {
        adminUserId: null,
        actorId: `${QA_PREFIX} deleted-admin`,
        actorEmail: "deleted.audit.admin@example.com",
        actorFullName: "Deleted Audit Admin",
        actorRole: "ADMIN",
        action: "APP_USER_STATUS_UPDATED",
        targetType: "app_user",
        targetId: `${QA_PREFIX} deleted-actor-target`,
        before: { isActive: true },
        after: { isActive: false },
        createdAt: new Date(now + 50),
      },
    ],
  });

  const deletedActor = await prisma.appUser.create({
    data: {
      email: DELETED_ADMIN_EMAIL,
      fullName: "Hard Deleted Audit Admin",
      role: UserRole.ADMIN,
      passwordHash,
      isActive: true,
    },
  });
  await prisma.adminAuditLog.create({
    data: {
      adminUserId: deletedActor.id,
      actorId: deletedActor.id,
      actorEmail: deletedActor.email,
      actorFullName: deletedActor.fullName,
      actorRole: deletedActor.role,
      action: "APP_USER_ROLE_UPDATED",
      targetType: "app_user",
      targetId: `${QA_PREFIX} hard-deleted-actor-target`,
      before: { role: "TEACHER" },
      after: { role: "ADMIN" },
      createdAt: new Date(now + 25),
    },
  });
  await prisma.appUser.delete({ where: { id: deletedActor.id } });
  const retainedLog = await prisma.adminAuditLog.findFirstOrThrow({
    where: { targetId: `${QA_PREFIX} hard-deleted-actor-target` },
    select: { adminUserId: true, actorEmail: true, actorFullName: true },
  });
  expect(retainedLog).toEqual({
    adminUserId: null,
    actorEmail: DELETED_ADMIN_EMAIL,
    actorFullName: "Hard Deleted Audit Admin",
  });
}

async function loginAsAuditAdmin(page: Page) {
  await setPortalSession(page, {
    uid: adminUserId,
    role: UserRole.ADMIN,
    email: ADMIN_EMAIL,
    fullName: `${QA_PREFIX} Admin`,
  });
}

test.describe("Admin audit logs", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaAuditData();
    await createAuditFixtures();
  });

  test.afterAll(async () => {
    await cleanupQaAuditData();
    await prisma.$disconnect();
  });

  test("admin can inspect audit records, filters, dashboard recent logs, and mobile layout", async ({
    page,
  }) => {
    await loginAsAuditAdmin(page);

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
    await expect(page.getByText("Review critical admin actions and entity changes.")).toBeVisible();
    await expect(page.getByLabel("Action type")).toBeVisible();
    await expect(page.getByLabel("Entity")).toBeVisible();
    await expect(page.getByLabel("Admin user")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Target ID" })).toBeVisible();
    await expect(page.locator("body")).toContainText(`${QA_PREFIX} Admin`);
    await expect(page.locator("body")).toContainText("Deleted Audit Admin");
    await expect(page.locator("body")).toContainText("deleted.audit.admin@example.com");
    await expect(page.locator("body")).toContainText("Hard Deleted Audit Admin");
    await expect(page.locator("body")).toContainText(DELETED_ADMIN_EMAIL);
    await expect(page.locator("body")).toContainText("APP_USER_CREATED");
    await expect(page.locator("body")).toContainText("PAYMENT_STATUS_UPDATED");
    await expect(page.locator("body")).toContainText("payment_transaction");
    await expect(page.locator("body")).toContainText(`${QA_PREFIX} payment`);
    await expect(page.locator("body")).toContainText('"role": "STUDENT"');
    await expect(page.locator("body")).toContainText('"learningStatus": "PAUSED"');
    await expect(page.locator("body")).toContainText('"status": "SUCCESS"');
    await expect(page.locator("body")).toContainText("[REDACTED]");
    await expect(page.locator("body")).toContainText("Добрий день");
    await expect(page.locator("body")).not.toContainText("[object Object]");
    await expect(page.locator("body")).not.toContainText("hashed-password");
    await expect(page.locator("body")).not.toContainText("TOTPSECRET");
    await expect(page.locator("body")).not.toContainText("CODE-1");

    await page.getByLabel("Action type").fill("APP_USER_ROLE_UPDATED");
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/actionType=APP_USER_ROLE_UPDATED/);
    await expect(page.locator("body")).toContainText("APP_USER_ROLE_UPDATED");
    await expect(page.getByText("PAYMENT_STATUS_UPDATED")).toHaveCount(0);

    await page.goto("/admin/audit?targetType=student");
    await expect(page.locator("body")).toContainText("STUDENT_LEARNING_STATUS_UPDATED");
    await expect(page.getByText("TEACHER_PROFILE_UPDATED")).toHaveCount(0);

    await page.goto(`/admin/audit?adminUserId=${adminUserId}`);
    await expect(page.locator("body")).toContainText(`${QA_PREFIX} Admin`);
    await expect(page.locator("body")).toContainText("APP_USER_CREATED");

    await page.goto(
      `/admin/audit?actionType=PAYMENT_STATUS_UPDATED&targetType=payment_transaction&adminUserId=${adminUserId}`,
    );
    await expect(page.locator("body")).toContainText("PAYMENT_STATUS_UPDATED");
    await expect(page.locator("body")).toContainText("payment_transaction");
    await expect(page.getByText("APP_USER_ROLE_UPDATED")).toHaveCount(0);

    await page.goto("/admin/audit?actionType=NOT_A_REAL_ACTION");
    await expect(page.getByText("No audit logs found.")).toBeVisible();

    await page.goto("/admin/audit?from=2999-01-01&to=2999-01-02");
    await expect(page.getByText("No audit logs found.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();
    await expect(page.locator("body")).toContainText("APP_USER_CREATED");
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/admin");
    await expect(page.locator("body")).toContainText("Recent Admin Audit Logs");
    await expect(page.locator("body")).toContainText("APP_USER_CREATED");
    await expect(page.locator("body")).toContainText(`${QA_PREFIX} app-user`);
  });

  test("guest and non-admin users cannot access audit logs", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/portal\/login/);

    for (const user of [
      {
        uid: studentUserId,
        role: UserRole.STUDENT,
        email: STUDENT_EMAIL,
        fullName: `${QA_PREFIX} Student`,
      },
      {
        uid: teacherUserId,
        role: UserRole.TEACHER,
        email: TEACHER_EMAIL,
        fullName: `${QA_PREFIX} Teacher`,
      },
      {
        uid: parentUserId,
        role: UserRole.PARENT,
        email: PARENT_EMAIL,
        fullName: `${QA_PREFIX} Parent`,
      },
    ]) {
      await setPortalSession(page, user);
      await page.goto("/admin/audit");
      await expect(page).toHaveURL(/\/portal\/unauthorized/);
      await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    }
  });
});
