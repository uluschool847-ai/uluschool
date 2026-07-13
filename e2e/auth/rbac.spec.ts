import { type Page, expect, test } from "@playwright/test";

const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const STUDENT_ADMIN_ROUTES = [
  "/admin/students",
  "/admin/students/new",
  "/admin/students/student-1",
  "/admin/students/student-1/edit",
] as const;

async function loginAs(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(expectedPath);
}

test.describe("RBAC - Route Protection", () => {
  test("guest cannot access admin", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/portal\/login/);
    expect(page.url()).toContain("reason=invalid");
  });

  test("guest cannot access student portal", async ({ page }) => {
    await page.goto("/portal/student");
    await page.waitForURL(/\/portal\/login/);
    expect(page.url()).toContain("reason=invalid");
  });

  test("guest cannot access teacher portal", async ({ page }) => {
    await page.goto("/portal/teacher");
    await page.waitForURL(/\/portal\/login/);
    expect(page.url()).toContain("reason=invalid");
  });

  test("student cannot access teacher portal", async ({ page }) => {
    await loginAs(page, "fixed.student@uluglobalacademy.com", /\/portal\/student/);
    await page.goto("/portal/teacher");
    await page.waitForURL(/\/portal\/unauthorized/);
  });

  test("student cannot access admin", async ({ page }) => {
    await loginAs(page, "fixed.student@uluglobalacademy.com", /\/portal\/student/);
    await page.goto("/admin");
    await page.waitForURL(/\/portal\/unauthorized/);
  });

  test("teacher cannot access admin", async ({ page }) => {
    await loginAs(page, "fixed.teacher@uluglobalacademy.com", /\/portal\/teacher/);
    await page.goto("/admin");
    await page.waitForURL(/\/portal\/unauthorized/);
  });

  for (const route of STUDENT_ADMIN_ROUTES) {
    test(`guest cannot access ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/portal\/login/);
      expect(page.url()).toContain("reason=invalid");
      expect(page.url()).toContain(`callbackUrl=${encodeURIComponent(route)}`);
    });
  }

  for (const route of STUDENT_ADMIN_ROUTES) {
    test(`student cannot access ${route}`, async ({ page }) => {
      await loginAs(page, "fixed.student@uluglobalacademy.com", /\/portal\/student/);
      await page.goto(route);
      await page.waitForURL(/\/portal\/unauthorized/);
    });
  }
});
