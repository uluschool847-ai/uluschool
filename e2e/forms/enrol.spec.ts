import { expect, test } from "@playwright/test";

test.describe("Enrol Form", () => {
  test("enrol form loads correctly", async ({ page }) => {
    await page.goto("/enrol");
    await expect(page.getByText(/enrol|register|start/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /next/i })).toBeVisible();
  });

  test("enrol form shows validation on incomplete step", async ({ page }) => {
    await page.goto("/enrol");
    await page.getByRole("button", { name: /next step/i }).click();
    await expect(page.getByText(/required|enter your|valid/i)).toBeVisible();
  });
});
