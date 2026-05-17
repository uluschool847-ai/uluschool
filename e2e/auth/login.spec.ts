import { expect, test } from "@playwright/test";

const VALID_EMAIL = "fixed.student@uluglobalacademy.com";
const VALID_PASSWORD = process.env.E2E_PORTAL_PASSWORD ?? "ChangeMe123!";

test.describe("Login Flow", () => {
  test.describe.configure({ timeout: 60000 });

  test("guest can access login page", async ({ page }) => {
    await page.goto("/portal/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("successful login redirects to role dashboard", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/password/i).fill(VALID_PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/student/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("invalid credentials show error message", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(VALID_EMAIL);
    await page.getByLabel(/password/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
  });

  test("empty form shows validation errors", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page.getByText(/required|enter your|valid/i)).toBeVisible();
  });
});
