import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

const COOKIE_DOMAIN = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").hostname;

async function setAdminSession(page: Page) {
  await page.context().addCookies([
    {
      domain: COOKIE_DOMAIN,
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      name: "ulu_session",
      path: "/",
      sameSite: "Lax",
      value: await createSessionToken({
        uid: "admin-123",
        role: UserRole.ADMIN,
        email: "fixed.admin@uluglobalacademy.com",
        fullName: "Fixed Admin",
      }),
    },
  ]);
}

async function expectNoGlobalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test.describe("Site header responsive controls", () => {
  test("landing page hands controls from mobile to desktop without duplicates", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/");

    const loginLink = page.locator('header a[href="/portal/login"]');
    const menuButton = page.locator('header button[aria-label="Open menu"]');
    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toHaveCount(1);
    await expect(menuButton).toBeVisible();
    await expect(loginLink).toHaveCount(1);
    await expect(loginLink).toBeHidden();
    await expectNoGlobalOverflow(page);

    await page.setViewportSize({ width: 1024, height: 800 });

    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toBeHidden();
    await expect(loginLink).toBeVisible();
    await expectNoGlobalOverflow(page);
  });

  test("authenticated header hands controls to desktop only at 2xl", async ({ page }) => {
    await setAdminSession(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");

    const menuButton = page.locator('header button[aria-label="Open menu"]');
    const portalLink = page.locator('header a[href="/admin"]');
    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toHaveCount(1);
    await expect(menuButton).toBeVisible();
    await expect(portalLink).toHaveCount(1);
    await expect(portalLink).toBeHidden();
    await expectNoGlobalOverflow(page);

    await page.setViewportSize({ width: 1600, height: 900 });

    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toBeHidden();
    await expect(portalLink).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
    await expectNoGlobalOverflow(page);
  });
});
