import { type Page, expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

const ENROL_EMAIL_PREFIX = "qa.enrol.c5.";

function assertLocalDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  expect(["localhost", "127.0.0.1"]).toContain(databaseUrl.hostname);
}

async function cleanupEnrolFixtures() {
  assertLocalDatabase();
  await prisma.enquiry.deleteMany({ where: { email: { startsWith: ENROL_EMAIL_PREFIX } } });
}

async function advanceToFinalStep(page: Page, email: string) {
  await page.goto("/enrol");
  await page.getByLabel(/parent\/guardian name/i).fill("C5 Parent Guardian");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/phone \/ whatsapp/i).fill("+254700123456");
  await page.getByRole("button", { name: /next step/i }).click();

  await page.getByLabel(/student name/i).fill("C5 Student");
  await page.getByLabel(/age \/ year level/i).fill("Year 8");
  await page.getByLabel(/curriculum level/i).selectOption({ index: 1 });
  await page.getByRole("checkbox", { name: /^mathematics$/i }).check();
  await page.getByRole("button", { name: /next step/i }).click();

  await page.getByLabel(/preferred schedule/i).fill("Weekdays after 16:00 EAT");
}

test.describe("Enrol Form", () => {
  test.beforeAll(() => {
    assertLocalDatabase();
  });

  test.afterEach(async () => {
    await cleanupEnrolFixtures();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("enrol form loads correctly", async ({ page }) => {
    await page.goto("/enrol");
    await expect(page.getByRole("heading", { name: /book a free trial class/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /next step/i })).toBeVisible();
  });

  test("enrol form shows validation on incomplete step", async ({ page }) => {
    await page.goto("/enrol");
    await page.getByRole("button", { name: /next step/i }).click();
    await expect(page.locator('output[role="alert"]')).toContainText(/enter valid details/i);
  });

  test("final step requires guardian consent and links to the privacy policy", async ({ page }) => {
    const email = `${ENROL_EMAIL_PREFIX}consent.${Date.now()}@example.com`;
    await advanceToFinalStep(page, email);

    const consent = page.getByRole("checkbox", { name: /i am the parent or guardian/i });
    await expect(consent).not.toBeChecked();
    await page.getByRole("button", { name: /submit enrolment/i }).click();
    await expect(page.locator('output[role="alert"]')).toContainText(/enter valid details/i);
    await expect.poll(() => prisma.enquiry.count({ where: { email } })).toBe(0);

    await page
      .locator("#enrol-consent-help")
      .getByRole("link", { name: /privacy policy/i })
      .click();
    await expect(page).toHaveURL(/\/privacy-policy$/);
    await expect(page.getByRole("heading", { name: /privacy policy/i })).toBeVisible();
  });

  test("valid local submission shows only its public reference ID", async ({ page }) => {
    const email = `${ENROL_EMAIL_PREFIX}success.${Date.now()}@example.com`;
    await advanceToFinalStep(page, email);
    await page.getByRole("checkbox", { name: /i am the parent or guardian/i }).check();
    await page.waitForTimeout(1_250);
    await page.getByRole("button", { name: /submit enrolment/i }).click();

    await expect(page.getByRole("heading", { name: /we've received your request/i })).toBeVisible();
    const reference = page.getByText(/^Reference ID: MS-\d{4}-\d{4,}$/);
    await expect(reference).toBeVisible();

    const enquiry = await prisma.enquiry.findFirstOrThrow({
      where: { email },
      select: { id: true, referenceId: true },
      orderBy: { createdAt: "desc" },
    });
    await expect(reference).toHaveText(`Reference ID: ${enquiry.referenceId}`);

    const bodyHtml = await page.locator("body").evaluate((body) => body.outerHTML);
    expect(bodyHtml).not.toContain("/admin/");
    expect(bodyHtml).not.toContain(enquiry.id);
  });
});
