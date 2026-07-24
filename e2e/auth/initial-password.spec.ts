import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const fixtureRunId = crypto.randomUUID();
const INITIAL_STUDENT_EMAIL = `e2e-initial-student-${fixtureRunId}@example.test`;
const INITIAL_STUDENT_ID = `e2e-initial-student-${fixtureRunId}`;
const INITIAL_STUDENT_PASSWORD = `Initial-Student-${crypto.randomUUID()}!`;
const ROTATED_CREDENTIAL = `C5-Rotated-${crypto.randomUUID()}!`;
const INITIAL_ADMIN_EMAIL = `e2e-initial-admin-${fixtureRunId}@example.test`;
const INITIAL_ADMIN_ID = `e2e-initial-admin-${fixtureRunId}`;
const INITIAL_ADMIN_PASSWORD = `Initial-Admin-${crypto.randomUUID()}!`;

const initialPasswordFixtures = [
  {
    id: INITIAL_STUDENT_ID,
    email: INITIAL_STUDENT_EMAIL,
    fullName: "Initial Password Student",
    password: INITIAL_STUDENT_PASSWORD,
    role: UserRole.STUDENT,
  },
  {
    id: INITIAL_ADMIN_ID,
    email: INITIAL_ADMIN_EMAIL,
    fullName: "Initial Password Administrator",
    password: INITIAL_ADMIN_PASSWORD,
    role: UserRole.ADMIN,
  },
];

function assertLocalDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  expect(["localhost", "127.0.0.1"]).toContain(databaseUrl.hostname);
}

async function createInitialPasswordFixture(fixture: (typeof initialPasswordFixtures)[number]) {
  assertLocalDatabase();
  const passwordHash = await hashPassword(fixture.password);
  await prisma.appUser.create({
    data: {
      id: fixture.id,
      email: fixture.email,
      fullName: fixture.fullName,
      role: fixture.role,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    },
  });
}

async function cleanupInitialPasswordFixtures() {
  const fixtureIds = initialPasswordFixtures.map((fixture) => fixture.id);
  await prisma.$transaction([
    prisma.adminAuditLog.deleteMany({
      where: {
        OR: [
          { targetId: { in: fixtureIds } },
          { actorId: { in: fixtureIds } },
          { adminUserId: { in: fixtureIds } },
        ],
      },
    }),
    prisma.appUser.deleteMany({ where: { id: { in: fixtureIds } } }),
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
    await Promise.all(initialPasswordFixtures.map(createInitialPasswordFixture));
  });

  test.afterAll(async () => {
    try {
      await cleanupInitialPasswordFixtures();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("student must rotate the temporary password before entering the portal", async ({
    page,
    context,
  }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(INITIAL_STUDENT_EMAIL);
    await page.getByLabel(/password/i).fill(INITIAL_STUDENT_PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/setup\/password$/);
    await expect(page.getByRole("heading", { name: /change your password/i })).toBeVisible();

    const deniedPage = await context.newPage();
    await deniedPage.goto("/portal/student");
    await expect(deniedPage).toHaveURL(/\/portal\/login\?/);
    await deniedPage.close();

    await fillPasswordForm(page, INITIAL_STUDENT_PASSWORD, "too-short");
    await expect(page.getByText(/use at least 12 characters/i).first()).toBeVisible();

    await fillPasswordForm(page, INITIAL_STUDENT_PASSWORD, INITIAL_STUDENT_PASSWORD);
    await expect(page.locator('output[role="alert"]')).toContainText(/password you have not used/i);

    await fillPasswordForm(page, INITIAL_STUDENT_PASSWORD, ROTATED_CREDENTIAL);
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
