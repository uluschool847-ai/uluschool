import { expect, test } from "@playwright/test";

test.describe("Contact Form", () => {
  test("contact form loads correctly", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/message/i)).toBeVisible();
  });

  test("contact form shows validation for empty submission", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: /send|submit/i }).click();
    await expect(page.getByText(/required|enter your|valid/i)).toBeVisible();
  });

  test("contact form submits successfully", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel(/full name/i).fill("Test User");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/phone/i).fill("+254700000000");
    await page.getByLabel(/student grade/i).fill("Year 9");
    await page.getByLabel(/message/i).fill("Test enquiry from automated smoke test");
    await page.getByRole("button", { name: /send|submit/i }).click();
    await expect(page.getByText(/thank you|reference id/i)).toBeVisible({ timeout: 15000 });
  });
});
