import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { authenticator } from "otplib";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ADMIN_EMAIL = `qa.security.admin.${RUN_ID}@example.com`;
const STUDENT_EMAIL = `qa.security.student.${RUN_ID}@example.com`;

let adminUserId = "";
let studentUserId = "";

function toBase64Url(input: string) {
  return Buffer.from(input, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signPayload(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  const signatureString = Array.from(new Uint8Array(signature))
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return toBase64Url(signatureString);
}

async function createSessionToken(input: {
  uid: string;
  role: UserRole;
  email: string;
  fullName: string;
  mfaVerified?: boolean;
}) {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      uid: input.uid,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      exp: Date.now() + 1000 * 60 * 60,
      mfaVerified: input.mfaVerified ?? true,
      authMethod: "password",
    }),
  );
  return `${payloadBase64}.${await signPayload(payloadBase64)}`;
}

async function setPortalSession(
  page: Page,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
    mfaVerified?: boolean;
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
    where: { email: { in: [ADMIN_EMAIL, STUDENT_EMAIL] } },
  });
}

async function createSecurityFixtures() {
  const passwordHash = await hashPassword(PASSWORD);
  const [admin, student] = await Promise.all([
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
  ]);
  adminUserId = admin.id;
  studentUserId = student.id;
}

async function loginWithPassword(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/portal/login?next=%2Fadmin%2Fsecurity");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
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

  test("admin can enable, verify-login, and disable TOTP 2FA without leaking secrets", async ({
    page,
  }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: `QA Security Admin ${RUN_ID}`,
    });

    await page.goto("/admin/security");
    await expect(page.getByRole("heading", { name: "Admin Security" })).toBeVisible();
    await expect(page.getByText(/production hardening/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /back to admin/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Two-Factor Authentication (TOTP)" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "SSO Callback" })).toBeVisible();
    await expect(page.getByText("/api/auth/sso/callback")).toBeVisible();
    await expect(page.getByText(/ADMIN_SSO_ENABLED=true/)).toBeVisible();
    await expect(page.getByText(/shared secret/i)).toBeVisible();
    await expect(page.getByText(/current status:\s*disabled/i)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Admin Security" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

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
    await expect(page).toHaveURL(/\/portal\/login\/verify-2fa\?next=%2Fadmin%2Fsecurity/);
    await expect(page.getByText(/pending admin session/i)).toBeVisible();
    await page.getByLabel(/authenticator code/i).fill("000000");
    await page.getByRole("button", { name: /verify 2fa/i }).click();
    await expect(page.getByText(/invalid authenticator code/i)).toBeVisible();

    const loginCode = authenticator.generate(adminEnabled.twoFactorSecret ?? "");
    await page.getByLabel(/authenticator code/i).fill(loginCode);
    await page.getByRole("button", { name: /verify 2fa/i }).click();
    await expect(page).toHaveURL(/\/admin\/security/);
    await expect(page.getByText(/current status:\s*enabled/i)).toBeVisible();

    await page.getByRole("button", { name: "Disable 2FA" }).click();
    await expect(page.getByText(/2FA disabled/i)).toBeVisible();
    await expect(page.getByText(/current status:\s*disabled/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/current status:\s*disabled/i)).toBeVisible();

    const adminDisabled = await prisma.appUser.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
    });
    expect(adminDisabled.twoFactorEnabled).toBe(false);
    expect(adminDisabled.twoFactorSecret).toBeNull();
    expect(adminDisabled.twoFactorBackupCodes).toEqual([]);

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        adminUserId,
        action: {
          in: [
            "ADMIN_2FA_ENABLED",
            "ADMIN_2FA_DISABLED",
            "ADMIN_LOGIN_PENDING_2FA",
            "ADMIN_LOGIN_2FA_TOTP_FAILED",
            "ADMIN_LOGIN_2FA_TOTP_SUCCESS",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLogs.some((log) => log.action === "ADMIN_2FA_ENABLED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "ADMIN_2FA_DISABLED")).toBe(true);
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
        uid: "teacher-security-1",
        role: UserRole.TEACHER,
        email: "fixed.teacher@uluglobalacademy.com",
        fullName: "Fixed Teacher",
      },
      {
        uid: "parent-security-1",
        role: UserRole.PARENT,
        email: "fixed.parent@uluglobalacademy.com",
        fullName: "Fixed Parent",
      },
    ]) {
      await setPortalSession(page, user);
      await page.goto("/admin/security");
      await expect(page).toHaveURL(/\/portal\/unauthorized/);
      await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    }
  });
});
