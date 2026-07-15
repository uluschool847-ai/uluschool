import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const FIXED_PARENT_NAME = "Fixed Parent";
const FIXED_CLASS_TITLE = "IGCSE Mathematics - Algebra";
const FIXED_CLASS_TEACHER = "Fixed Teacher";

test.describe("Admin Student Management", () => {
  test.describe.configure({ timeout: 300000, mode: "serial" });

  async function cleanupQaStudentsData() {
    await prisma.appUser.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "qa.student." } },
          { email: { startsWith: "inactive.parent." } },
        ],
      },
    });
  }

  async function loginAsAdmin(page: Page) {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/(admin|security)/);
  }

  async function openStudentRegistryByEmail(page: Page, email: string) {
    await page.goto(`/admin/students?q=${encodeURIComponent(email)}`);
    const row = page.locator("tbody tr").filter({ hasText: email }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    return row;
  }

  async function createStudentThroughUi(page: Page) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullName = `QA Student ${suffix}`;
    const updatedFullName = `QA Student Updated ${suffix}`;
    const email = `qa.student.${suffix}@uluglobalacademy.com`;

    await page.goto("/admin/students/new");
    await expect(page.getByRole("heading", { level: 1, name: /create student/i })).toBeVisible();

    await page.getByLabel(/full name/i).fill(fullName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/phone/i).fill("+254700999000");
    await page.getByRole("button", { name: /create student/i }).click();

    await expect(page).toHaveURL(/\/admin\/students\/new$/);
    const credentialsPanel = page.getByRole("region", { name: /^temporary credentials$/i });
    await expect(credentialsPanel).toBeVisible();
    const temporaryPasswordLocator = credentialsPanel
      .locator("dt")
      .filter({ hasText: /temporary password/i })
      .locator("xpath=following-sibling::dd[1]/code");
    await expect(temporaryPasswordLocator).toHaveCount(1);
    const temporaryPassword = (await temporaryPasswordLocator.textContent())?.trim() ?? "";
    expect(temporaryPassword).toMatch(/\S+/);

    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: /temporary credentials/i })).toHaveCount(0);
    const registryRow = await openStudentRegistryByEmail(page, email);
    await expect(registryRow).toContainText(fullName);

    const editHref = await registryRow.getByRole("link", { name: /edit/i }).getAttribute("href");
    expect(editHref).toBeTruthy();
    const studentId = editHref?.match(/\/admin\/students\/([^/]+)\/edit/)?.[1];
    expect(studentId).toBeTruthy();

    return {
      studentId: studentId as string,
      fullName,
      updatedFullName,
      email,
    };
  }

  async function createInactiveLinkedParent(studentId: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullName = `Inactive Parent ${suffix}`;
    const email = `inactive.parent.${suffix}@uluglobalacademy.com`;

    const parent = await prisma.appUser.create({
      data: {
        email,
        fullName,
        role: UserRole.PARENT,
        passwordHash: await hashPassword(PASSWORD),
        isActive: false,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });

    await prisma.appUser.update({
      where: { id: studentId },
      data: {
        parents: {
          connect: { id: parent.id },
        },
      },
    });

    return parent;
  }

  async function forceSelectOption(
    page: Page,
    selectName: "parentId" | "classId",
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

  async function getOptionValueByLabel(
    page: Page,
    selectName: "parentId" | "classId",
    label: string,
  ) {
    return page
      .locator(`select[name="${selectName}"] option`)
      .evaluateAll(
        (options, targetLabel) =>
          options
            .find((option) => option.textContent?.trim() === targetLabel)
            ?.getAttribute("value") ?? null,
        label,
      );
  }

  test.beforeAll(async () => {
    await cleanupQaStudentsData();
  });

  test.afterAll(async () => {
    await cleanupQaStudentsData();
    await prisma.$disconnect();
  });

  test("admin can create, edit, and toggle a student account", async ({ page }) => {
    await loginAsAdmin(page);
    const student = await createStudentThroughUi(page);

    await page.goto(`/admin/students/${student.studentId}/edit`);
    await expect(page.getByRole("heading", { level: 1, name: /edit student/i })).toBeVisible();
    await page.getByLabel(/full name/i).fill(student.updatedFullName);
    await page.getByLabel(/phone/i).fill("+254700999111");
    await page.getByRole("button", { name: /save changes|update student/i }).click();

    await page.waitForURL(
      /\/admin\/students(?:\?.*studentMessage=Student%20account%20updated\.)?$/,
    );

    const updatedRegistryRow = await openStudentRegistryByEmail(page, student.email);
    await expect(updatedRegistryRow).toContainText(student.updatedFullName);
    await expect(updatedRegistryRow).toContainText(/active/i);

    await updatedRegistryRow.getByRole("button", { name: /^deactivate$/i }).click();
    await expect(page.getByRole("dialog", { name: /deactivate student account/i })).toContainText(
      student.updatedFullName,
    );
    await page.getByRole("button", { name: /confirm deactivation/i }).click();
    await page.waitForURL(
      /\/admin\/students(?:\?.*studentMessage=Student%20account%20deactivated\.)?$/,
    );

    await page.goto(`/admin/students/${student.studentId}`);
    await expect(page.getByRole("heading", { name: /status/i })).toBeVisible();
    await expect(page.getByText(/^inactive$/i)).toBeVisible();

    await page.goto(`/admin/students?q=${encodeURIComponent(student.email)}`);
    const deactivatedRow = page.locator("tbody tr").filter({ hasText: student.email }).first();
    await expect(deactivatedRow.getByRole("button", { name: /^activate$/i })).toBeVisible();

    await deactivatedRow.getByRole("button", { name: /^activate$/i }).click();
    await page.waitForURL(
      /\/admin\/students(?:\?.*studentMessage=Student%20account%20activated\.)?$/,
    );

    await page.goto(`/admin/students/${student.studentId}`);
    await expect(page.getByRole("heading", { name: /status/i })).toBeVisible();
    await expect(page.getByText(/account access/i).locator("..")).toContainText(/active/i);

    await page.goto(`/admin/students/${student.studentId}`);
    await expect(page.getByRole("heading", { name: /student detail/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /profile/i })).toBeVisible();
    await expect(page.getByText(student.updatedFullName)).toBeVisible();
    await expect(page.getByText(student.email)).toBeVisible();
    await expect(page.getByText("+254700999111")).toBeVisible();
    await expect(page.getByRole("heading", { name: /status/i })).toBeVisible();
    await expect(page.getByText(/account access/i).locator("..")).toContainText(/active/i);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /save changes|create student|link parent|enroll class|delete student/i,
      }),
    ).toHaveCount(0);
  });

  test("admin can move a student through learning lifecycle statuses without deleting the account", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const student = await createStudentThroughUi(page);

    for (const status of ["Trial", "Active", "Paused", "Inactive"]) {
      await page.goto(`/admin/students/${student.studentId}/edit`);
      await page
        .getByRole("combobox", { name: /learning status|lifecycle status/i })
        .selectOption({ label: status });
      await page.getByRole("button", { name: /update status|save status|set status/i }).click();
      await page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?studentMessage=Student(?:%20|\\+)learning(?:%20|\\+)status(?:%20|\\+)updated\\.$`,
          "i",
        ),
      );

      await page.goto(`/admin/students?q=${encodeURIComponent(student.email)}`);
      const registryRow = page.locator("tbody tr").filter({ hasText: student.email }).first();
      await expect(registryRow).toBeVisible();
      await expect(registryRow).toContainText(new RegExp(status, "i"));

      await page.goto(`/admin/students/${student.studentId}`);
      await expect(page.getByText(student.email)).toBeVisible();
      await expect(page.getByText(new RegExp(`^${status}$`, "i")).last()).toBeVisible();
    }
  });

  test("admin can link and unlink parents and class enrollments", async ({ page }) => {
    await loginAsAdmin(page);
    const student = await createStudentThroughUi(page);

    await page.goto(`/admin/students/${student.studentId}/edit`);
    await expect(page.getByText(/no linked parents yet/i)).toBeVisible();
    await expect(page.getByText(/no enrolled classes yet/i)).toBeVisible();

    await page
      .getByRole("combobox", { name: /^Parent$/i })
      .selectOption({ label: FIXED_PARENT_NAME });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?.*studentMessage=Parent(?:%20|\\+)linked\\.`,
        ),
      ),
      page.getByRole("button", { name: /link parent/i }).click(),
    ]);
    await page.goto(`/admin/students/${student.studentId}`);
    await expect(page.getByRole("heading", { name: /linked parents/i })).toBeVisible();
    await expect(page.getByText(/Fixed Parent/i)).toBeVisible();

    await page.goto(`/admin/students/${student.studentId}/edit`);

    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?.*studentMessage=Parent(?:%20|\\+)unlinked\\.`,
        ),
      ),
      (async () => {
        await page.getByRole("button", { name: /remove/i }).click();
        await expect(page.getByRole("dialog", { name: /remove parent link/i })).toContainText(
          "Fixed Parent",
        );
        await page.getByRole("button", { name: /confirm removal/i }).click();
      })(),
    ]);
    await page.goto(`/admin/students/${student.studentId}`);
    await expect(page.getByRole("heading", { name: /linked parents/i })).toBeVisible();
    await expect(page.getByText(/Fixed Parent/i)).toHaveCount(0);
    await expect(page.getByText(/no linked parents yet/i)).toBeVisible();

    await page.goto(`/admin/students/${student.studentId}/edit`);
    await page
      .getByRole("combobox", { name: /^Class$/i })
      .selectOption({ label: FIXED_CLASS_TITLE });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?.*studentMessage=Class(?:%20|\\+)enrolled\\.`,
        ),
      ),
      page.getByRole("button", { name: /enroll class/i }).click(),
    ]);

    await page.goto(`/admin/students/${student.studentId}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: /enrolled classes/i })).toBeVisible();
    await expect(page.getByText(FIXED_CLASS_TITLE)).toBeVisible();
    await expect(page.getByText(`Teacher: ${FIXED_CLASS_TEACHER}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: /derived teachers/i })).toBeVisible();
    await expect(page.getByText(FIXED_CLASS_TEACHER, { exact: true })).toBeVisible();

    const registryRow = await openStudentRegistryByEmail(page, student.email);
    await expect(registryRow).toContainText(FIXED_CLASS_TITLE);
    await expect(registryRow).toContainText(FIXED_CLASS_TEACHER);

    await page.goto(`/admin/students/${student.studentId}/edit`);
    await page.reload();
    const classRow = page.locator("li", { hasText: FIXED_CLASS_TITLE }).first();
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?.*studentMessage=Class(?:%20|\\+)unlinked\\.`,
        ),
      ),
      (async () => {
        await classRow.getByRole("button", { name: /remove/i }).click();
        await expect(page.getByRole("dialog", { name: /remove class enrollment/i })).toContainText(
          FIXED_CLASS_TITLE,
        );
        await page.getByRole("button", { name: /confirm removal/i }).click();
      })(),
    ]);

    await page.goto(`/admin/students/${student.studentId}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: /enrolled classes/i })).toBeVisible();
    await expect(page.getByText(/no enrolled classes yet/i)).toBeVisible();
  });

  test("inactive linked parent remains visible in student admin surfaces", async ({ page }) => {
    await loginAsAdmin(page);
    const student = await createStudentThroughUi(page);
    const inactiveParent = await createInactiveLinkedParent(student.studentId);

    await page.goto(`/admin/students/${student.studentId}/edit`);
    await expect(page.getByRole("heading", { name: /parent links/i })).toBeVisible();
    await expect(page.getByText(inactiveParent.fullName)).toBeVisible();
    await expect(page.getByText(inactiveParent.email)).toBeVisible();
    await expect(page.getByText(/no linked parents yet/i)).toHaveCount(0);

    await page.goto(`/admin/students/${student.studentId}`);
    await expect(page.getByRole("heading", { name: /linked parents/i })).toBeVisible();
    await expect(
      page.getByText(`${inactiveParent.fullName} (${inactiveParent.email})`),
    ).toBeVisible();
  });

  test("duplicate email shows visible failure feedback", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/admin/students/new");
    await page.getByLabel(/full name/i).fill("Duplicate Email Student");
    await page.getByLabel(/email/i).fill("fixed.student@uluglobalacademy.com");
    await page.getByRole("button", { name: /create student/i }).click();

    const duplicateEmailAlert = page.locator("div[role='alert']").filter({
      hasText: /already exists/i,
    });
    await expect(duplicateEmailAlert).toBeVisible();
  });

  test("duplicate parent link shows visible failure feedback", async ({ page }) => {
    await loginAsAdmin(page);
    const student = await createStudentThroughUi(page);

    await page.goto(`/admin/students/${student.studentId}/edit`);
    const parentId = await getOptionValueByLabel(page, "parentId", FIXED_PARENT_NAME);
    expect(parentId).toBeTruthy();
    await page
      .getByRole("combobox", { name: /^Parent$/i })
      .selectOption({ label: FIXED_PARENT_NAME });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?.*studentMessage=Parent(?:%20|\\+)linked\\.`,
        ),
      ),
      page.getByRole("button", { name: /link parent/i }).click(),
    ]);

    await forceSelectOption(page, "parentId", parentId as string, FIXED_PARENT_NAME);
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit(?:\\?.*studentError=Parent(?:%20|\\+)already(?:%20|\\+)linked\\.)$`,
        ),
      ),
      page.getByRole("button", { name: /link parent/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /parent links/i })).toBeVisible();
    await expect(
      page.locator("div[role='alert']").filter({ hasText: "Parent already linked." }).first(),
    ).toBeVisible();
  });

  test("duplicate class link shows visible failure feedback", async ({ page }) => {
    await loginAsAdmin(page);
    const student = await createStudentThroughUi(page);

    await page.goto(`/admin/students/${student.studentId}/edit`);
    const classId = await getOptionValueByLabel(page, "classId", FIXED_CLASS_TITLE);
    expect(classId).toBeTruthy();
    await page
      .getByRole("combobox", { name: /^Class$/i })
      .selectOption({ label: FIXED_CLASS_TITLE });
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit\\?.*studentMessage=Class(?:%20|\\+)enrolled\\.`,
        ),
      ),
      page.getByRole("button", { name: /enroll class/i }).click(),
    ]);

    await forceSelectOption(page, "classId", classId as string, FIXED_CLASS_TITLE);
    await Promise.all([
      page.waitForURL(
        new RegExp(
          `/admin/students/${student.studentId}/edit(?:\\?.*studentError=Class(?:%20|\\+)already(?:%20|\\+)enrolled\\.)$`,
        ),
      ),
      page.getByRole("button", { name: /enroll class/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /class enrollments/i })).toBeVisible();
    await expect(
      page.locator("div[role='alert']").filter({ hasText: "Class already enrolled." }).first(),
    ).toBeVisible();
  });
});
