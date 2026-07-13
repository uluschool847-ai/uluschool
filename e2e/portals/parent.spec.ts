import { expect, test } from "@playwright/test";

const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";

test.describe("Parent Portal", () => {
  test("parent dashboard loads with data", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.parent@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/parent/);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
