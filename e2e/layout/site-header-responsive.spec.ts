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

async function expectHeaderToFitViewport(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("header")
        .first()
        .evaluate((header) => {
          const tolerance = 1;
          const visibleElements = [header, ...header.querySelectorAll<HTMLElement>("*")].filter(
            (element) => {
              const style = window.getComputedStyle(element);
              const bounds = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0;
            },
          );

          return visibleElements.every((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= -tolerance && bounds.right <= window.innerWidth + tolerance;
          });
        }),
    )
    .toBe(true);
}

test.describe("Site header responsive controls", () => {
  test("landing page keeps responsive controls without duplicate theme buttons", async ({
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
    await expect(loginLink).toBeVisible();
    await expectHeaderToFitViewport(page);

    await page.setViewportSize({ width: 1024, height: 800 });

    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toBeHidden();
    await expect(loginLink).toBeVisible();
    await expectHeaderToFitViewport(page);
  });

  test("authenticated header keeps actions visible while the compact menu hands off at 2xl", async ({
    page,
  }) => {
    await setAdminSession(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");

    const menuButton = page.locator('header button[aria-label="Open menu"]');
    const portalLink = page.locator('header a[href="/admin"]');
    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toHaveCount(1);
    await expect(menuButton).toBeVisible();
    await expect(portalLink).toHaveCount(1);
    await expect(portalLink).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
    await expectHeaderToFitViewport(page);

    await page.setViewportSize({ width: 1600, height: 900 });

    await expect(page.getByRole("button", { name: "Toggle theme" })).toHaveCount(1);
    await expect(menuButton).toBeHidden();
    await expect(portalLink).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
    await expectHeaderToFitViewport(page);
  });
});
