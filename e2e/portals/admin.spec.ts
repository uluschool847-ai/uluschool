import { expect, test } from "@playwright/test";

test.describe("Admin Portal", () => {
  test("admin dashboard loads", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.admin@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill("ChangeMe123!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/(admin|security)/);

    await page.goto("/admin");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("admin users page loads", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.admin@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill("ChangeMe123!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/(admin|security)/);

    await page.goto("/admin/users");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("admin billing page loads", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.admin@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill("ChangeMe123!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/(admin|security)/);

    await page.goto("/admin/billing");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
