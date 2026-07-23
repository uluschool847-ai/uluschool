import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { authenticator } from "otplib";

import { createSessionToken } from "@/e2e/helpers/session";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const ADMIN_REQUIRE_2FA = (process.env.ADMIN_REQUIRE_2FA ?? "true") !== "false";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ADMIN_EMAIL = `qa.security.admin.${RUN_ID}@example.com`;
const STUDENT_EMAIL = `qa.security.student.${RUN_ID}@example.com`;
const TEACHER_EMAIL = `qa.security.teacher.${RUN_ID}@example.com`;
const PARENT_EMAIL = `qa.security.parent.${RUN_ID}@example.com`;

let adminUserId = "";
let studentUserId = "";
let teacherUserId = "";
let parentUserId = "";

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

async function cleanupQaSecurityData() {
  await prisma.appUser.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, STUDENT_EMAIL, TEACHER_EMAIL, PARENT_EMAIL] } },
  });
}

async function createSecurityFixtures() {
  const passwordHash = await hashPassword(PASSWORD);
  const [admin, student, teacher, parent] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: ADMIN_EMAIL,
        fullName: `QA Security Admin ${RUN_ID}`,
        role: UserRole.ADMIN,
        passwordHash,
        isActive: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    }),
    prisma.appUser.create({
      data: {
        email: STUDENT_EMAIL,
        fullName: `QA Security Student ${RUN_ID}`,
        role: UserRole.STUDENT,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: TEACHER_EMAIL,
        fullName: `QA Security Teacher ${RUN_ID}`,
        role: UserRole.TEACHER,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: PARENT_EMAIL,
        fullName: `QA Security Parent ${RUN_ID}`,
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
}

async function loginWithPassword(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/portal/login?next=%2Fadmin%2Fsecurity");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
}

async function setLegacyPendingAdminTwoFactorCookie(page: Page) {
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

test.describe("Admin Security", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaSecurityData();
    await createSecurityFixtures();
  });

  test.afterAll(async () => {
    await cleanupQaSecurityData();
    await prisma.$disconnect();
  });

  test("clears a stale legacy pending cookie and redirects retired 2FA routes", async ({
    page,
  }) => {
    for (const path of ["/portal/login", "/portal/setup/2fa", "/portal/login/verify-2fa"]) {
      await test.step(path, async () => {
        await setLegacyPendingAdminTwoFactorCookie(page);

        const response = await page.goto(path);

        expect(response?.status()).toBe(200);
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

  test("admin can enable and verify-login with TOTP without exposing self-service disablement", async ({
    page,
  }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: `QA Security Admin ${RUN_ID}`,
    });

    await page.goto("/admin/security");
    await expect(page.getByRole("heading", { level: 1, name: "Admin Security" })).toBeVisible();
    await expect(page.getByText(/production hardening/i)).toBeVisible();
    const adminSecurityHeader = page
      .getByRole("heading", { level: 1, name: "Admin Security" })
      .locator("xpath=ancestor::header[1]");
    await expect(
      adminSecurityHeader.getByRole("link", { name: /continue to admin dashboard/i }),
    ).toHaveAttribute("href", "/admin");
    await expect(
      page.getByRole("heading", { name: "Two-Factor Authentication (TOTP)" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "SSO Callback" })).toHaveCount(0);
    await expect(page.getByText(/current status:\s*disabled/i)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1, name: "Admin Security" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/admin/security?setup2fa=required&next=%2Fadmin%2Fsecurity");
    if (ADMIN_REQUIRE_2FA) {
      await expect(page.getByText(/2FA setup is required/i)).toBeVisible();
      await expect(page.getByText(/redirected here after password login/i)).toBeVisible();
      await expect(page.getByText(/ADMIN_REQUIRE_2FA=true/i)).toBeVisible();
      await expect(page.getByRole("link", { name: /set up 2fa below/i })).toHaveAttribute(
        "href",
        "#two-factor-setup",
      );
    } else {
      await expect(page.getByText(/2FA setup is optional in this environment/i)).toBeVisible();
      await expect(page.getByText(/ADMIN_REQUIRE_2FA=false/i)).toBeVisible();
      await expect(
        adminSecurityHeader.getByRole("link", { name: /continue to admin dashboard/i }),
      ).toHaveAttribute("href", "/admin/security");
    }

    await page.goto("/admin/security");
    await page.getByRole("button", { name: "Generate 2FA Secret" }).click();
    await expect(page.getByText(/2FA secret generated/i)).toBeVisible();
    await expect(page.getByText(/manual secret/i)).toBeVisible();
    await expect(page.getByText(/otpauth:\/\//i)).toBeVisible();

    let adminSetup = await prisma.appUser.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    expect(adminSetup.twoFactorEnabled).toBe(false);
    expect(adminSetup.twoFactorSecret).toBeTruthy();

    await page.getByLabel(/confirm code/i).fill("000000");
    await page.getByRole("button", { name: "Enable 2FA" }).click();
    await expect(page.getByText(/invalid code/i)).toBeVisible();
    adminSetup = await prisma.appUser.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    expect(adminSetup.twoFactorEnabled).toBe(false);

    const validSetupCode = authenticator.generate(adminSetup.twoFactorSecret ?? "");
    await page.getByLabel(/confirm code/i).fill(validSetupCode);
    await page.getByRole("button", { name: "Enable 2FA" }).click();
    await expect(page.getByText(/2FA enabled/i)).toBeVisible();
    await expect(page.getByText(/current status:\s*enabled/i)).toBeVisible();
    await expect(page.getByText("Backup codes (save now):")).toBeVisible();

    const adminEnabled = await prisma.appUser.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
    });
    expect(adminEnabled.twoFactorEnabled).toBe(true);
    expect(adminEnabled.twoFactorBackupCodes.length).toBeGreaterThan(0);

    await loginWithPassword(page, ADMIN_EMAIL);
    await expect(page).toHaveURL(/\/portal\/login\/verify-2fa\?next=%2Fadmin%2Fsecurity/, {
      timeout: 60000,
    });
    await expect(page.getByText(/pending admin session/i)).toBeVisible();
    await page.getByLabel(/authenticator code/i).fill("000000");
    await page.getByRole("button", { name: /verify 2fa/i }).click();
    await expect(page.getByText(/invalid authenticator code/i)).toBeVisible();

    const loginCode = authenticator.generate(adminEnabled.twoFactorSecret ?? "");
    await page.getByLabel(/authenticator code/i).fill(loginCode);
    await page.getByRole("button", { name: /verify 2fa/i }).click();
    await expect(page).toHaveURL(/\/admin\/security/, { timeout: 60000 });
    await expect(page.getByText(/current status:\s*enabled/i)).toBeVisible();

    await expect(page.getByRole("button", { name: "Disable 2FA" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(/current status:\s*enabled/i)).toBeVisible();

    const adminAfterVerification = await prisma.appUser.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
    });
    expect(adminAfterVerification.twoFactorEnabled).toBe(true);
    expect(adminAfterVerification.twoFactorSecret).toBeTruthy();
    expect(adminAfterVerification.twoFactorBackupCodes.length).toBeGreaterThan(0);

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        adminUserId,
        action: {
          in: [
            "ADMIN_2FA_ENABLED",
            "ADMIN_LOGIN_PASSWORD_VERIFIED",
            "ADMIN_LOGIN_2FA_TOTP_FAILED",
            "ADMIN_LOGIN_2FA_TOTP_SUCCESS",
            "LOGIN_SUCCESS",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLogs.some((log) => log.action === "ADMIN_2FA_ENABLED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "LOGIN_SUCCESS")).toBe(true);
    expect(JSON.stringify(auditLogs)).not.toMatch(/secret|token|backup|otpauth|000000/i);
  });

  test("guest and non-admin users cannot access security admin", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/security");
    await expect(page).toHaveURL(/\/portal\/login/);

    for (const user of [
      {
        uid: studentUserId,
        role: UserRole.STUDENT,
        email: STUDENT_EMAIL,
        fullName: `QA Security Student ${RUN_ID}`,
      },
      {
        uid: teacherUserId,
        role: UserRole.TEACHER,
        email: TEACHER_EMAIL,
        fullName: `QA Security Teacher ${RUN_ID}`,
      },
      {
        uid: parentUserId,
        role: UserRole.PARENT,
        email: PARENT_EMAIL,
        fullName: `QA Security Parent ${RUN_ID}`,
      },
    ]) {
      await setPortalSession(page, user);
      await page.goto("/admin/security");
      await expect(page).toHaveURL(/\/portal\/unauthorized/);
      await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    }
  });
});
