import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { authenticator } from "otplib";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const password =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `qa.initial-2fa.${runId}@example.com`;
let adminId = "";

test.describe("initial administrator 2FA enrollment", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });
  test.skip((process.env.ADMIN_REQUIRE_2FA ?? "true") === "false", "2FA enrollment is disabled");

  test.beforeAll(async () => {
    const admin = await prisma.appUser.create({
      data: {
        email,
        fullName: `QA Initial 2FA ${runId}`,
        role: UserRole.ADMIN,
        passwordHash: await hashPassword(password),
        isActive: true,
        mustChangePassword: false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });
    adminId = admin.id;
  });

  test.afterAll(async () => {
    if (adminId) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: adminId } });
      await prisma.appUser.deleteMany({ where: { id: adminId } });
    }
    await prisma.$disconnect();
  });

  test("restarts stale setup, hands codes off once, replaces cookies, and preserves normal TOTP login", async ({
    page,
  }) => {
    await page.goto("/portal/login?next=%2Fadmin");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/setup\/2fa/, { timeout: 60_000 });

    await page.getByRole("button", { name: /set up authenticator/i }).click();
    const firstSecret = (await page.getByTestId("initial-2fa-manual-key").textContent())?.trim();
    expect(firstSecret).toBeTruthy();

    await page.getByLabel(/authenticator code/i).fill("000000");
    await page.getByRole("button", { name: /confirm and enable/i }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/invalid authenticator code/i);

    const competingTab = await page.context().newPage();
    await competingTab.goto("/portal/setup/2fa");
    await competingTab.getByRole("button", { name: /set up authenticator/i }).click();
    const rotatedSecret = (
      await competingTab.getByTestId("initial-2fa-manual-key").textContent()
    )?.trim();
    expect(rotatedSecret).toBeTruthy();
    expect(rotatedSecret).not.toBe(firstSecret);
    await competingTab.close();

    await page.getByLabel(/authenticator code/i).fill(authenticator.generate(firstSecret ?? ""));
    await page.getByRole("button", { name: /confirm and enable/i }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/setup changed/i);
    await expect(page.getByText(firstSecret ?? "missing-secret")).toHaveCount(0);
    await page.getByRole("button", { name: /start setup again/i }).click();

    const currentSecret = (await page.getByTestId("initial-2fa-manual-key").textContent())?.trim();
    expect(currentSecret).toBeTruthy();
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await page.getByLabel(/authenticator code/i).fill(authenticator.generate(currentSecret ?? ""));
    await page.getByRole("button", { name: /confirm and enable/i }).click();

    await expect(page.getByRole("heading", { name: /save your backup codes/i })).toBeFocused();
    await expect(
      page.getByRole("list", { name: /backup codes/i }).getByRole("listitem"),
    ).toHaveCount(8);
    const cookies = await page.context().cookies();
    expect(cookies.filter((cookie) => cookie.name === "ulu_session")).toHaveLength(1);
    expect(cookies.some((cookie) => cookie.name === "ulu_initial_setup")).toBe(false);
    expect(cookies.some((cookie) => cookie.name === "ulu_admin_2fa_pending")).toBe(false);

    await page.reload();
    await expect(page).toHaveURL(/\/portal\/login(?:\?|$)/);
    await expect(page.getByRole("list", { name: /backup codes/i })).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto("/portal/login?next=%2Fadmin");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/login\/verify-2fa/, { timeout: 60_000 });
    await page.getByLabel(/authenticator code/i).fill(authenticator.generate(currentSecret ?? ""));
    await page.getByRole("button", { name: /verify 2fa/i }).click();
    await expect(page).toHaveURL(/\/admin(?:\?|$)/, { timeout: 60_000 });

    const audit = await prisma.adminAuditLog.findMany({
      where: { targetId: adminId, action: "ADMIN_2FA_ENABLED" },
    });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toMatch(/secret|totp|backup|cookie|otpauth/i);
  });
});
