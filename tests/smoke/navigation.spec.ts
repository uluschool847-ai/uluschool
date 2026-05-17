import { expect, test } from "@playwright/test";

test.describe("Navigation Smoke Tests", () => {
  test("homepage loads without 500 error and displays the main layout", async ({ page }) => {
    // Navigate to the root URL
    const response = await page.goto("http://localhost:3000/");

    // Assert that we received a valid response and not a 500 Server Error
    expect(response?.status()).toBeLessThan(500);

    // Explicitly check that the page body does not contain an unhandled runtime error message
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("500 Internal Server Error");
    expect(bodyText).not.toContain("Module not found");

    // Assert that the SiteHeader is visible
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Assert that the specific logo text inside the header is visible
    await expect(page.getByText("ULU Online School").first()).toBeVisible();
  });
});
