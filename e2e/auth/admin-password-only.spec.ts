import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const fixtureRunId = crypto.randomUUID();
const configuredAdminId = `e2e-password-admin-configured-${fixtureRunId}`;
const bootstrapAdminId = `e2e-password-admin-bootstrap-${fixtureRunId}`;
const studentId = `e2e-password-student-${fixtureRunId}`;
const configuredAdminEmail = `e2e-password-admin-configured-${fixtureRunId}@example.test`;
const bootstrapAdminEmail = `e2e-password-admin-bootstrap-${fixtureRunId}@example.test`;
const studentEmail = `e2e-password-student-${fixtureRunId}@example.test`;
const password = `Configured-Admin-${crypto.randomUUID()}!`;
const temporaryPassword = `Bootstrap-Admin-${crypto.randomUUID()}!`;
const rotatedPassword = `Rotated-Admin-${crypto.randomUUID()}!`;
const studentPassword = `Student-Password-${crypto.randomUUID()}!`;
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function generateDormantTotpSecret() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (value) => base32Alphabet[value % base32Alphabet.length],
  ).join("");
}

const dormantTwoFactorState = {
  twoFactorEnabled: true,
  twoFactorSecret: generateDormantTotpSecret(),
  twoFactorBackupCodes: ["local-dormant-backup-code-a", "local-dormant-backup-code-b"],
};

function assertLocalDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  expect(["localhost", "127.0.0.1"]).toContain(databaseUrl.hostname);
}

async function createAdminFixture(input: {
  id: string;
  email: string;
  password: string;
  mustChangePassword: boolean;
  dormantTwoFactorState?: typeof dormantTwoFactorState;
}) {
  await prisma.appUser.create({
    data: {
      id: input.id,
      email: input.email,
      fullName: `Password-only Administrator ${input.id}`,
      passwordHash: await hashPassword(input.password),
      role: UserRole.ADMIN,
      isActive: true,
      mustChangePassword: input.mustChangePassword,
      ...input.dormantTwoFactorState,
    },
  });
}

async function cleanupAdminFixtures() {
  const fixtureIds = [configuredAdminId, bootstrapAdminId, studentId];
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

async function createStudentFixture() {
  await prisma.appUser.create({
    data: {
      id: studentId,
      email: studentEmail,
      fullName: `Password-only Student ${studentId}`,
      passwordHash: await hashPassword(studentPassword),
      role: UserRole.STUDENT,
      isActive: true,
      mustChangePassword: false,
    },
  });
}

async function login(page: import("@playwright/test").Page, email: string, credential: string) {
  await page.context().clearCookies();
  await page.goto("/portal/login?next=%2Fadmin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(credential);
  await page.getByRole("button", { name: /login|sign in/i }).click();
}

async function changePassword(
  page: import("@playwright/test").Page,
  currentPassword: string,
  newPassword: string,
) {
  await page.getByLabel(/current password/i).fill(currentPassword);
  await page.getByLabel(/^new password/i).fill(newPassword);
  await page.getByLabel(/confirm new password/i).fill(newPassword);
  await page.getByRole("button", { name: /change password/i }).click();
}

async function addLegacyPendingCookie(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "ulu_admin_2fa_pending",
      value: "legacy-pending-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

test.describe("Administrator password-only login", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeAll(async () => {
    assertLocalDatabase();
    await Promise.all([
      createAdminFixture({
        id: configuredAdminId,
        email: configuredAdminEmail,
        password,
        mustChangePassword: false,
        dormantTwoFactorState,
      }),
      createAdminFixture({
        id: bootstrapAdminId,
        email: bootstrapAdminEmail,
        password: temporaryPassword,
        mustChangePassword: true,
      }),
      createStudentFixture(),
    ]);
  });

  test.afterAll(async () => {
    try {
      await cleanupAdminFixtures();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("an existing configured admin signs in with password only without using retired 2FA", async ({
    page,
  }) => {
    const retiredTwoFactorRequests: string[] = [];
    const recordRetiredTwoFactorRequest = (request: import("@playwright/test").Request) => {
      const { pathname } = new URL(request.url());
      if (pathname === "/portal/setup/2fa" || pathname === "/portal/login/verify-2fa") {
        retiredTwoFactorRequests.push(pathname);
      }
    };
    page.on("request", recordRetiredTwoFactorRequest);

    await login(page, configuredAdminEmail, password);

    await expect(page).toHaveURL(/\/admin(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Admin Dashboard", exact: true })).toBeVisible();
    expect(retiredTwoFactorRequests).toEqual([]);
    await expect
      .poll(async () =>
        prisma.appUser.findUniqueOrThrow({
          where: { id: configuredAdminId },
          select: {
            twoFactorEnabled: true,
            twoFactorSecret: true,
            twoFactorBackupCodes: true,
          },
        }),
      )
      .toEqual(dormantTwoFactorState);

    page.off("request", recordRetiredTwoFactorRequest);
  });

  test("a bootstrap admin changes the temporary password and reaches admin directly", async ({
    page,
  }) => {
    await login(page, bootstrapAdminEmail, temporaryPassword);
    await expect(page).toHaveURL(/\/portal\/setup\/password$/);

    await changePassword(page, temporaryPassword, rotatedPassword);
    await expect(page).toHaveURL(/\/admin(?:\?|$)/);

    await page.getByRole("button", { name: "Log Out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);

    await login(page, bootstrapAdminEmail, rotatedPassword);
    await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  });

  test("a student password login targeting admin stays in the student portal", async ({ page }) => {
    await login(page, studentEmail, studentPassword);

    await expect(page).toHaveURL(/\/portal\/student$/);
    await expect(page).not.toHaveURL(/\/admin(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Student Dashboard", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Admin Dashboard", exact: true })).toHaveCount(
      0,
    );
  });

  test("retired 2FA routes clear stale pending cookies and redirect to login", async ({ page }) => {
    for (const route of ["/portal/setup/2fa", "/portal/login/verify-2fa"]) {
      await test.step(route, async () => {
        await addLegacyPendingCookie(page);

        await page.goto(route);
        await expect(page).toHaveURL(/\/portal\/login$/);
        await expect(page.getByRole("heading", { name: "Login", exact: true })).toBeVisible();
        await expect
          .poll(async () =>
            (await page.context().cookies()).some(
              (cookie) => cookie.name === "ulu_admin_2fa_pending",
            ),
          )
          .toBe(false);
      });
    }
  });
});
