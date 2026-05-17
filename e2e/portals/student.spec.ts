import { expect, test } from "@playwright/test";

test.describe("Student Portal", () => {
  test("student dashboard loads with data", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.student@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill("ChangeMe123!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/student/);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/assignment|homework/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("student schedule loads", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.student@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill("ChangeMe123!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/student/);

    await page.goto("/portal/schedule");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
