import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
const FIXED_STUDENT_NAME = "Fixed Student";
const RESPONSIVE_VIEWPORTS = [
  { height: 844, name: "mobile", width: 390 },
  { height: 1024, name: "tablet", width: 768 },
];
const QA_EMAIL_PREFIXES = [
  "qa.parent.",
  "inactive.student.",
  "sofia.shevchenko.",
  "mark.shevchenko.",
  "unlinked.student.",
];

test.describe("Admin Parent Management", () => {
  test.describe.configure({ timeout: 300000, mode: "serial" });

  async function cleanupQaParentData() {
    const users = await prisma.appUser.findMany({
      where: {
        OR: QA_EMAIL_PREFIXES.map((prefix) => ({
          email: { startsWith: prefix },
        })),
      },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    if (userIds.length === 0) return;

    await prisma.submission.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentProgress.deleteMany({
      where: { OR: [{ studentId: { in: userIds } }, { teacherId: { in: userIds } }] },
    });
    await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
  }

  test.beforeAll(async () => {
    await cleanupQaParentData();
  });

  test.afterAll(async () => {
    await cleanupQaParentData();
    await prisma.$disconnect();
  });

  async function loginAsAdmin(page: Page) {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/(admin|security)/);
  }

  async function loginAsParent(page: Page, email: string) {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/parent/);
  }

  async function openParentRegistryByEmail(page: Page, email: string) {
    await page.goto(`/admin/parents?q=${encodeURIComponent(email)}`);
    const row = page.locator("tbody tr").filter({ hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    return row;
  }

  async function createParentThroughUi(page: Page) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullName = `QA Parent ${suffix}`;
    const updatedFullName = `QA Parent Updated ${suffix}`;
    const email = `qa.parent.${suffix}@uluglobalacademy.com`;

    await page.goto("/admin/parents/new");
    await expect(
      page.getByRole("heading", { level: 1, name: /create parent|create guardian/i }),
    ).toBeVisible();

    await page.getByLabel(/full name/i).fill(fullName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/phone|whatsapp/i).fill("+254701999000");
    await page.getByRole("button", { name: /create parent|create guardian/i }).click();

    await page.waitForURL(/\/admin\/parents(?:\?.*parentMessage=Parent%20account%20created\.)?$/);
    const registryRow = await openParentRegistryByEmail(page, email);
    await expect(registryRow).toContainText(fullName);

    const editHref = await registryRow.getByRole("link", { name: /edit/i }).getAttribute("href");
    expect(editHref).toBeTruthy();
    const parentId = editHref?.match(/\/admin\/parents\/([^/]+)\/edit/)?.[1];
    expect(parentId).toBeTruthy();

    return {
      parentId: parentId as string,
      fullName,
      updatedFullName,
      email,
    };
  }

  async function createInactiveLinkedStudent(parentId: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullName = `Inactive Student ${suffix}`;
    const email = `inactive.student.${suffix}@uluglobalacademy.com`;

    const student = await prisma.appUser.create({
      data: {
        email,
        fullName,
        role: UserRole.STUDENT,
        passwordHash: await hashPassword(PASSWORD),
        isActive: false,
        parents: {
          connect: { id: parentId },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });

    return student;
  }

  async function createActiveStudent(label: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullName = `${label} ${suffix}`;
    const email = `${label.toLowerCase().replaceAll(" ", ".")}.${suffix}@uluglobalacademy.com`;

    return prisma.appUser.create({
      data: {
        email,
        fullName,
        role: UserRole.STUDENT,
        passwordHash: await hashPassword(PASSWORD),
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });
  }

  async function forceSelectOption(
    page: Page,
    selectName: "studentId",
    value: string,
    label: string,
  ) {
    await page.locator(`select[name="${selectName}"]`).evaluate(
      (element, option) => {
        const select = element as HTMLSelectElement;
        let syntheticOption = Array.from(select.options).find(
          (candidate) => candidate.value === option.value,
        );

        if (!syntheticOption) {
          syntheticOption = document.createElement("option");
          syntheticOption.value = option.value;
          syntheticOption.text = option.label;
          select.appendChild(syntheticOption);
        }

        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { value, label },
    );
  }

  async function getStudentOptionValue(page: Page, label: string) {
    return page
      .locator('select[name="studentId"] option')
      .evaluateAll(
        (options, targetLabel) =>
          options
            .find((option) => option.textContent?.trim() === targetLabel)
            ?.getAttribute("value") ?? null,
        label,
      );
  }

  test("admin can create, edit, toggle, link, and unlink a parent account", async ({ page }) => {
    await loginAsAdmin(page);
    const parent = await createParentThroughUi(page);

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    await expect(
      page.getByRole("heading", { level: 1, name: /edit parent|edit guardian/i }),
    ).toBeVisible();
    await page.getByLabel(/full name/i).fill(parent.updatedFullName);
    await page.getByLabel(/phone|whatsapp/i).fill("+254701999111");
    await page.getByRole("button", { name: /save changes|update parent/i }).click();

    await page.waitForURL(/\/admin\/parents(?:\?.*parentMessage=Parent%20account%20updated\.)?$/);
    const updatedRow = await openParentRegistryByEmail(page, parent.email);
    await expect(updatedRow).toContainText(parent.updatedFullName);

    await updatedRow.getByRole("button", { name: /^deactivate$/i }).click();
    await expect(page.getByRole("dialog", { name: /deactivate parent account/i })).toContainText(
      parent.updatedFullName,
    );
    await page.getByRole("button", { name: /confirm deactivation/i }).click();
    await page.waitForURL(
      /\/admin\/parents(?:\?.*parentMessage=Parent%20account%20deactivated\.)?$/,
    );

    await page.goto(`/admin/parents/${parent.parentId}`);
    await expect(page.getByRole("heading", { name: /status/i })).toBeVisible();
    await expect(page.getByText(/^inactive$/i)).toBeVisible();

    await page.goto(`/admin/parents?q=${encodeURIComponent(parent.email)}`);
    const deactivatedRow = page.locator("tbody tr").filter({ hasText: parent.email }).first();
    await deactivatedRow.getByRole("button", { name: /^activate$/i }).click();
    await page.waitForURL(/\/admin\/parents(?:\?.*parentMessage=Parent%20account%20activated\.)?$/);

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    await expect(page.getByText(/no linked students|no students linked/i)).toBeVisible();
    await page
      .getByRole("combobox", { name: /^Student$/i })
      .selectOption({ label: FIXED_STUDENT_NAME });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit\\?.*parentMessage=Student(?:%20|\\+)linked\\.`,
        ),
      ),
      page.getByRole("button", { name: /link student|add student/i }).click(),
    ]);

    await page.goto(`/admin/parents/${parent.parentId}`);
    await expect(page.getByRole("heading", { name: /linked students/i })).toBeVisible();
    await expect(page.getByText(FIXED_STUDENT_NAME)).toBeVisible();

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit\\?.*parentMessage=Student(?:%20|\\+)unlinked\\.`,
        ),
      ),
      (async () => {
        await page.getByRole("button", { name: /remove|unlink/i }).click();
        await expect(page.getByRole("dialog", { name: /remove student link/i })).toContainText(
          FIXED_STUDENT_NAME,
        );
        await page.getByRole("button", { name: /confirm removal/i }).click();
      })(),
    ]);

    await page.goto(`/admin/parents/${parent.parentId}`);
    await expect(page.getByText(FIXED_STUDENT_NAME)).toHaveCount(0);
    await expect(page.getByText(/no linked students|no students linked/i)).toBeVisible();
  });

  test("duplicate email and duplicate student link show visible failure feedback", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.goto("/admin/parents/new");
    await page.getByLabel(/full name/i).fill("Duplicate Parent");
    await page.getByLabel(/email/i).fill("fixed.parent@uluglobalacademy.com");
    await page.getByRole("button", { name: /create parent|create guardian/i }).click();

    await expect(
      page
        .locator("div[role='alert']")
        .filter({ hasText: /already exists/i })
        .first(),
    ).toBeVisible();

    const parent = await createParentThroughUi(page);

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    const studentId = await getStudentOptionValue(page, FIXED_STUDENT_NAME);
    expect(studentId).toBeTruthy();
    await page
      .getByRole("combobox", { name: /^Student$/i })
      .selectOption({ label: FIXED_STUDENT_NAME });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit\\?.*parentMessage=Student(?:%20|\\+)linked\\.`,
        ),
      ),
      page.getByRole("button", { name: /link student|add student/i }).click(),
    ]);

    await forceSelectOption(page, "studentId", studentId as string, FIXED_STUDENT_NAME);
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit(?:\\?.*parentError=Student(?:%20|\\+)already(?:%20|\\+)linked\\.)$`,
        ),
      ),
      page.getByRole("button", { name: /link student|add student/i }).click(),
    ]);

    await expect(
      page.locator("div[role='alert']").filter({ hasText: "Student already linked." }).first(),
    ).toBeVisible();
  });

  test("inactive linked student remains visible in parent admin surfaces", async ({ page }) => {
    await loginAsAdmin(page);
    const parent = await createParentThroughUi(page);
    const inactiveStudent = await createInactiveLinkedStudent(parent.parentId);

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    await expect(
      page.getByRole("heading", { name: /student links|linked students/i }),
    ).toBeVisible();
    await expect(page.getByText(inactiveStudent.fullName)).toBeVisible();
    await expect(page.getByText(inactiveStudent.email)).toBeVisible();

    await page.goto(`/admin/parents/${parent.parentId}`);
    await expect(page.getByRole("heading", { name: /linked students/i })).toBeVisible();
    await expect(
      page.getByText(`${inactiveStudent.fullName} (${inactiveStudent.email})`),
    ).toBeVisible();
  });

  test("parent portal shows only linked children and updates after admin unlink", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const parent = await createParentThroughUi(page);
    const sofia = await createActiveStudent("Sofia Shevchenko");
    const mark = await createActiveStudent("Mark Shevchenko");
    const unlinkedStudent = await createActiveStudent("Unlinked Student");

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    await page
      .getByRole("combobox", { name: /^Student$/i })
      .selectOption({ label: sofia.fullName });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit\\?.*parentMessage=Student(?:%20|\\+)linked\\.`,
        ),
      ),
      page.getByRole("button", { name: /link student|add student/i }).click(),
    ]);

    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    await page.getByRole("combobox", { name: /^Student$/i }).selectOption({ label: mark.fullName });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit\\?.*parentMessage=Student(?:%20|\\+)linked\\.`,
        ),
      ),
      page.getByRole("button", { name: /link student|add student/i }).click(),
    ]);

    await page.context().clearCookies();
    await loginAsParent(page, parent.email);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(sofia.fullName)).toBeVisible();
    await expect(page.getByText(mark.fullName)).toBeVisible();
    await expect(page.getByText(unlinkedStudent.fullName)).toHaveCount(0);

    await page.context().clearCookies();
    await loginAsAdmin(page);
    await page.goto(`/admin/parents/${parent.parentId}/edit`);
    const sofiaRow = page.locator("li").filter({ hasText: sofia.fullName }).first();
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/parents/${parent.parentId}/edit\\?.*parentMessage=Student(?:%20|\\+)unlinked\\.`,
        ),
      ),
      (async () => {
        await sofiaRow.getByRole("button", { name: /remove|unlink/i }).click();
        await expect(page.getByRole("dialog", { name: /remove student link/i })).toContainText(
          sofia.fullName,
        );
        await page.getByRole("button", { name: /confirm removal/i }).click();
      })(),
    ]);

    await page.context().clearCookies();
    await loginAsParent(page, parent.email);
    await expect(page.getByText(sofia.fullName)).toHaveCount(0);
    await expect(page.getByText(mark.fullName)).toBeVisible();
    await expect(page.getByText(unlinkedStudent.fullName)).toHaveCount(0);
  });

  test("inactive parent cannot log in to the parent portal", async ({ page }) => {
    await loginAsAdmin(page);
    const parent = await createParentThroughUi(page);
    const parentRow = await openParentRegistryByEmail(page, parent.email);

    await parentRow.getByRole("button", { name: /^deactivate$/i }).click();
    await expect(page.getByRole("dialog", { name: /deactivate parent account/i })).toContainText(
      parent.fullName,
    );
    await page.getByRole("button", { name: /confirm deactivation/i }).click();
    await page.waitForURL(
      /\/admin\/parents(?:\?.*parentMessage=Parent%20account%20deactivated\.)?$/,
    );

    await page.context().clearCookies();
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(parent.email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/portal\/login/);
  });

  test("parent registry table remains usable on mobile and tablet layouts", async ({ page }) => {
    await loginAsAdmin(page);

    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await test.step(`${viewport.name} layout`, async () => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto("/admin/parents");

        await expect(page.getByRole("heading", { name: "Parents & Guardians" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Create Parent" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Apply filters" })).toBeVisible();

        const registrySection = page.locator('section[aria-label="Parent registry results"]');
        await expect(
          registrySection.getByRole("heading", { name: "Parent Registry" }),
        ).toBeVisible();

        const tableScroller = registrySection.locator(".overflow-x-auto");
        await expect(tableScroller).toBeVisible();
        await expect(registrySection.getByRole("columnheader", { name: "Parent" })).toBeVisible();

        const pageMetrics = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.clientWidth + 1);

        const tableMetrics = await tableScroller.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        expect(tableMetrics.clientWidth).toBeGreaterThan(0);
        expect(tableMetrics.scrollWidth).toBeGreaterThanOrEqual(tableMetrics.clientWidth);

        await tableScroller.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await expect(registrySection.getByRole("columnheader", { name: "Actions" })).toBeVisible();
      });
    }
  });

  test("non-admin cannot access parent admin routes", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.student@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/student|\/portal\/unauthorized|\/admin\/security/);

    await page.goto("/admin/parents");
    await expect(page).toHaveURL(/\/portal\/unauthorized|\/portal\/login/);
  });
});
