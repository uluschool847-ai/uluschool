import { type Page, expect, test } from "@playwright/test";

const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "fixed.admin@uluglobalacademy.com";
const TEACHER_EMAIL = "fixed.teacher@uluglobalacademy.com";
const STUDENT_EMAIL = "fixed.student@uluglobalacademy.com";
const PARENT_EMAIL = "fixed.parent@uluglobalacademy.com";

const adminRoutes = [
  { path: "/admin", heading: "Admin Dashboard" },
  { path: "/admin/users", heading: "User Management" },
  { path: "/admin/security", heading: "Admin Security" },
  { path: "/admin/teachers", heading: "Teachers" },
  { path: "/admin/students", heading: "Students" },
  { path: "/admin/parents", heading: "Parents" },
  { path: "/admin/classes", heading: "Class Groups" },
  { path: "/admin/subjects", heading: "Subjects" },
  { path: "/admin/cms", heading: "Content Management" },
  { path: "/admin/cms/pages", heading: "Pages" },
  { path: "/admin/cms/blog", heading: "Blog Posts" },
  { path: "/admin/cms/faq", heading: "FAQ Items" },
  { path: "/admin/analytics", heading: "Business Intelligence" },
  { path: "/admin/analytics/inputs", heading: "Analytics Inputs" },
  { path: "/admin/billing", heading: "Billing" },
  { path: "/admin/audit", heading: "Audit Log" },
  { path: "/admin/tasks", heading: "Manager Tasks" },
  { path: "/admin/ai-drafts", heading: "AI Draft Assistant" },
  { path: "/admin/reminders", heading: "Reminder Logs" },
  { path: "/admin/submissions", heading: "Enrolment Submissions" },
  { path: "/admin/leads", heading: "Contact Leads" },
] as const;

const sensitiveRoutes = [
  "/admin",
  "/admin/users",
  "/admin/security",
  "/admin/billing",
  "/admin/audit",
] as const;

const adminHeaderRoutes = [
  "/admin/teachers",
  "/admin/classes",
  "/admin/parents/new",
  "/admin/classes/new",
] as const;

const diagnosticsByPage = new WeakMap<Page, string[]>();

const expectedRedirectingPostPaths = new Set(["/portal/login", "/admin/reminders"]);
const expectedAbortedGetPaths = new Set([
  "/api/auth/session",
  "/portal/parent",
  "/portal/student",
  "/portal/teacher",
]);

function installDiagnostics(page: Page) {
  const issues: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.push(`console error: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    issues.push(`page error: ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const resourceType = request.resourceType();
    const url = request.url();
    const failureText = request.failure()?.errorText ?? "";
    if (["eventsource", "font", "image", "websocket"].includes(resourceType)) {
      return;
    }
    if (request.method() === "POST" && /net::ERR_ABORTED/i.test(failureText)) {
      const pathname = new URL(url).pathname;
      if (expectedRedirectingPostPaths.has(pathname)) {
        return;
      }
    }
    if (request.method() === "GET" && /net::ERR_ABORTED/i.test(failureText)) {
      const pathname = new URL(url).pathname;
      if (expectedAbortedGetPaths.has(pathname)) {
        return;
      }
    }
    if (
      request.method() === "GET" &&
      /[?&]_rsc=/.test(url) &&
      /net::ERR_ABORTED/i.test(failureText)
    ) {
      return;
    }
    if (url.includes("/_next/webpack-hmr")) {
      return;
    }
    issues.push(`request failed: ${request.method()} ${url} ${failureText}`.trim());
  });

  page.on("response", (response) => {
    if (response.status() >= 500) {
      issues.push(`network ${response.status()}: ${response.url()}`);
    }
  });

  diagnosticsByPage.set(page, issues);
}

async function loginAs(page: Page, email: string, landingUrl: RegExp) {
  await page.context().clearCookies();
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(landingUrl, { timeout: 60000 });
}

test.describe("Admin full coverage smoke and RBAC", () => {
  test.describe.configure({ timeout: 360000, mode: "serial" });

  test.beforeEach(async ({ page }) => {
    installDiagnostics(page);
  });

  test.afterEach(async ({ page }) => {
    expect(diagnosticsByPage.get(page) ?? []).toEqual([]);
  });

  test("admin can load every primary admin workspace", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);

    for (const route of adminRoutes) {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} should not return a server error`).toBeLessThan(
        500,
      );
      await expect(page).toHaveURL(new RegExp(`${route.path.replace(/\//g, "\\/")}(\\?.*)?$`));
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
    }
  });

  test("admin routes keep authenticated header actions visible", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);

    for (const route of adminHeaderRoutes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should not return a server error`).toBeLessThan(500);
      await expect(page.getByRole("link", { name: "Admin Dashboard" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Log In" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Sign Up" })).toHaveCount(0);
    }
  });

  test("admin dashboard search action updates query state and renders empty feedback", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);

    const query = `QA-SMOKE-NO-MATCH-${Date.now()}`;
    await page.goto("/admin");
    await page.getByRole("searchbox", { name: /search/i }).fill(query);
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page).toHaveURL(new RegExp(`\\/admin\\?page=1&search=${query}`));
    await expect(page.getByText("No matching records found.")).toBeVisible();
  });

  test("admin reminder dry run completes with visible feedback", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);

    const response = await page.goto("/admin/reminders");
    expect(response?.status(), "/admin/reminders should not return a server error").toBeLessThan(
      500,
    );
    await page.getByRole("button", { name: "Dry Run Reminder Job" }).click();

    await expect(page.getByText(/dry run completed/i)).toBeVisible({ timeout: 30000 });
  });

  for (const user of [
    {
      label: "teacher",
      email: TEACHER_EMAIL,
      landingUrl: /\/portal\/teacher|\/portal\/unauthorized|\/admin\/security/,
    },
    {
      label: "student",
      email: STUDENT_EMAIL,
      landingUrl: /\/portal\/student|\/portal\/unauthorized|\/admin\/security/,
    },
    {
      label: "parent",
      email: PARENT_EMAIL,
      landingUrl: /\/portal\/parent|\/portal\/unauthorized|\/admin\/security/,
    },
  ]) {
    test(`${user.label} cannot access sensitive admin workspaces`, async ({ page }) => {
      await loginAs(page, user.email, user.landingUrl);

      for (const route of sensitiveRoutes) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/portal\/unauthorized|\/portal\/login|\/login/);
      }
    });
  }
});
