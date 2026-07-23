import { expect, test } from "@playwright/test";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const INITIAL_STUDENT_EMAIL = "fixed.initial.student@uluglobalacademy.com";
const INITIAL_STUDENT_ID = "student-initial-setup-123";
const INITIAL_PASSWORD = process.env.E2E_INITIAL_PASSWORD ?? "C5InitialStudent123!";
const ROTATED_CREDENTIAL = `C5-Rotated-${crypto.randomUUID()}!`;
const INITIAL_ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const INITIAL_ADMIN_ID = "admin-123";
const INITIAL_ADMIN_PASSWORD = `Initial-Admin-${crypto.randomUUID()}!`;

let originalAdminState: {
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
} | null = null;

function assertLocalDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  expect(["localhost", "127.0.0.1"]).toContain(databaseUrl.hostname);
}

async function restoreInitialPasswordFixture() {
  assertLocalDatabase();
  const passwordHash = await hashPassword(INITIAL_PASSWORD);
  const [, restored] = await prisma.$transaction([
    prisma.adminAuditLog.deleteMany({
      where: {
        OR: [{ targetId: INITIAL_STUDENT_ID }, { actorEmail: INITIAL_STUDENT_EMAIL }],
      },
    }),
    prisma.appUser.updateMany({
      where: { id: INITIAL_STUDENT_ID, email: INITIAL_STUDENT_EMAIL },
      data: {
        passwordHash,
        mustChangePassword: true,
        isActive: true,
      },
    }),
  ]);
  return restored;
}

async function resetAdminInitialPasswordFixture() {
  assertLocalDatabase();
  const passwordHash = await hashPassword(INITIAL_ADMIN_PASSWORD);
  const [, restored] = await prisma.$transaction([
    prisma.adminAuditLog.deleteMany({
      where: {
        OR: [{ targetId: INITIAL_ADMIN_ID }, { actorEmail: INITIAL_ADMIN_EMAIL }],
      },
    }),
    prisma.appUser.updateMany({
      where: { id: INITIAL_ADMIN_ID, email: INITIAL_ADMIN_EMAIL },
      data: {
        passwordHash,
        mustChangePassword: true,
        isActive: true,
      },
    }),
  ]);
  return restored;
}

async function restoreAdminFixture() {
  if (!originalAdminState) return;

  await prisma.$transaction([
    prisma.adminAuditLog.deleteMany({
      where: {
        OR: [{ targetId: INITIAL_ADMIN_ID }, { actorEmail: INITIAL_ADMIN_EMAIL }],
      },
    }),
    prisma.appUser.updateMany({
      where: { id: INITIAL_ADMIN_ID, email: INITIAL_ADMIN_EMAIL },
      data: originalAdminState,
    }),
  ]);
}

async function fillPasswordForm(
  page: import("@playwright/test").Page,
  currentPassword: string,
  newPassword: string,
) {
  await page.getByLabel(/current password/i).fill(currentPassword);
  await page.getByLabel(/^new password/i).fill(newPassword);
  await page.getByLabel(/confirm new password/i).fill(newPassword);
  await page.getByRole("button", { name: /change password/i }).click();
}

test.describe("Initial password setup", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeAll(async () => {
    assertLocalDatabase();
    const [studentRestored, admin] = await Promise.all([
      restoreInitialPasswordFixture(),
      prisma.appUser.findUniqueOrThrow({
        where: { id: INITIAL_ADMIN_ID },
        select: {
          passwordHash: true,
          mustChangePassword: true,
          isActive: true,
        },
      }),
    ]);
    originalAdminState = admin;
    const adminRestored = await resetAdminInitialPasswordFixture();
    expect(studentRestored.count).toBe(1);
    expect(adminRestored.count).toBe(1);
  });

  test.afterAll(async () => {
    await restoreInitialPasswordFixture();
    await restoreAdminFixture();
    await prisma.$disconnect();
  });

  test("student must rotate the temporary password before entering the portal", async ({
    page,
    context,
  }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(INITIAL_STUDENT_EMAIL);
    await page.getByLabel(/password/i).fill(INITIAL_PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/setup\/password$/);
    await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();

    const deniedPage = await context.newPage();
    await deniedPage.goto("/portal/student");
    await expect(deniedPage).toHaveURL(/\/portal\/login\?/);
    await deniedPage.close();

    await fillPasswordForm(page, INITIAL_PASSWORD, "too-short");
    await expect(page.getByText(/use at least 12 characters/i).first()).toBeVisible();

    await fillPasswordForm(page, INITIAL_PASSWORD, INITIAL_PASSWORD);
    await expect(page.locator('output[role="alert"]')).toContainText(/password you have not used/i);

    await fillPasswordForm(page, INITIAL_PASSWORD, ROTATED_CREDENTIAL);
    await expect(page).toHaveURL(/\/portal\/student$/);
    await expect(page.getByRole("heading", { name: /student dashboard/i })).toBeVisible();
    await expect(page.getByRole("main")).toContainText(INITIAL_STUDENT_EMAIL);
  });

  test("administrator rotates a temporary password directly into the admin dashboard", async ({
    page,
  }) => {
    const rotatedAdminCredential = `Rotated-Admin-${crypto.randomUUID()}!`;

    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(INITIAL_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(INITIAL_ADMIN_PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/setup\/password$/);
    await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();

    await fillPasswordForm(page, INITIAL_ADMIN_PASSWORD, rotatedAdminCredential);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page).not.toHaveURL(/\/(portal\/login\/verify-2fa|portal\/setup\/2fa)/);
    await expect(page.getByRole("heading", { name: "Admin Dashboard", exact: true })).toBeVisible();
  });
});
