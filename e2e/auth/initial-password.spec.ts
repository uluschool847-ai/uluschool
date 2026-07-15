import { expect, test } from "@playwright/test";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const INITIAL_STUDENT_EMAIL = "fixed.initial.student@uluglobalacademy.com";
const INITIAL_STUDENT_ID = "student-initial-setup-123";
const INITIAL_PASSWORD = process.env.E2E_INITIAL_PASSWORD ?? "C5InitialStudent123!";
const ROTATED_CREDENTIAL = `C5-Rotated-${crypto.randomUUID()}!`;

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
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    }),
  ]);
  return restored;
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
    const restored = await restoreInitialPasswordFixture();
    expect(restored.count).toBe(1);
  });

  test.afterAll(async () => {
    await restoreInitialPasswordFixture();
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
});
