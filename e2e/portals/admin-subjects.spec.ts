import { type Page, expect, test } from "@playwright/test";
import { StudentLearningStatus, UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const TEACHER_EMAIL = "fixed.teacher@uluglobalacademy.com";
const STUDENT_EMAIL = "fixed.admin-subject.student@uluglobalacademy.com";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SUBJECT_PREFIX = `QA Subject ${RUN_ID}`;
const CLASS_PREFIX = `QA Subject Class ${RUN_ID}`;

let adminUserId = "admin-123";
let teacherUserId = "teacher-123";
let studentUserId = "qa-subject-student";

test.describe("Admin Subject Management", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupTestData();
    await ensurePortalUsers();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  test("admin manages subjects and linked class subject display end to end", async ({ page }) => {
    const activeSubjectName = `${SUBJECT_PREFIX} Core`;
    const activeSubjectSlug = `qa-subject-${RUN_ID}`;
    const updatedDescription = "Updated subject description for scheduling and catalogue use.";
    const dependencyFreeSubjectName = `${SUBJECT_PREFIX} Delete`;
    const dependencyFreeSubjectSlug = `qa-subject-delete-${RUN_ID}`;
    const classTitle = `${CLASS_PREFIX} Core`;

    await loginAsAdmin(page);

    await page.goto("/admin/subjects");
    await expect(page.getByRole("heading", { name: /subjects/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /create subject|new subject/i })).toBeVisible();

    await createSubject(page, {
      name: activeSubjectName,
      slug: activeSubjectSlug,
      description: "Created by admin subjects e2e.",
      priority: 41,
      isActive: true,
    });

    await page.goto(`/admin/subjects?q=${encodeURIComponent(activeSubjectName)}`);
    const subjectRow = rowByText(page, activeSubjectName);
    await expect(subjectRow).toBeVisible();
    await expect(subjectRow).toContainText(activeSubjectSlug);
    await expect(subjectRow).toContainText("Active");

    await subjectRow.getByRole("link", { name: /edit/i }).click();
    await page.getByLabel(/description/i).fill(updatedDescription);
    await page.getByLabel(/priority/i).fill("7");
    await page.getByLabel(/active/i).uncheck();
    await page.getByRole("button", { name: /save|update subject/i }).click();
    await expect(page.getByText(/subject updated/i)).toBeVisible({ timeout: 30000 });

    await page.goto(`/admin/subjects?q=${encodeURIComponent(activeSubjectName)}`);
    const inactiveRow = rowByText(page, activeSubjectName);
    await expect(inactiveRow).toContainText("Inactive");
    await expect(inactiveRow).toContainText("7");

    await page.goto("/subjects");
    await expect(page.getByText(activeSubjectName)).toHaveCount(0);

    await page.goto(`/admin/subjects/${await findSubjectId(activeSubjectSlug)}/edit`);
    await page.getByLabel(/active/i).check();
    await page.getByRole("button", { name: /save|update subject/i }).click();
    await expect(page.getByText(/subject updated/i)).toBeVisible({ timeout: 30000 });

    await createScheduledClassWithSubject(page, {
      title: classTitle,
      subjectName: activeSubjectName,
    });

    await page.goto(`/admin/classes?q=${encodeURIComponent(classTitle)}`);
    const classRow = rowByText(page, classTitle);
    await expect(classRow).toBeVisible();
    await expect(classRow).toContainText(activeSubjectName);

    await enrollStudentInClass(page, classTitle);

    await loginAs(page, TEACHER_EMAIL, /\/portal\/teacher|\/admin\/security/);
    await page.goto("/portal/teacher");
    const teacherClassCard = page.locator("article").filter({ hasText: classTitle }).first();
    await expect(teacherClassCard).toBeVisible();
    await expect(teacherClassCard).toContainText(activeSubjectName);

    await loginAs(page, STUDENT_EMAIL, /\/portal\/student|\/admin\/security/);
    await page.goto("/portal/schedule?month=2026-06");
    const studentScheduleClass = page.locator("article").filter({ hasText: classTitle }).first();
    await expect(studentScheduleClass).toBeVisible();
    await expect(studentScheduleClass).toContainText(activeSubjectName);

    await loginAsAdmin(page);
    await page.goto(`/admin/subjects?q=${encodeURIComponent(activeSubjectName)}`);
    await rowByText(page, activeSubjectName)
      .getByRole("button", { name: /delete|archive/i })
      .click();
    await expect(page.getByText(/dependencies|cannot be deleted|in use/i)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(activeSubjectName)).toBeVisible();

    await createSubject(page, {
      name: dependencyFreeSubjectName,
      slug: dependencyFreeSubjectSlug,
      description: "Dependency-free subject used to verify delete or archive behavior.",
      priority: 99,
      isActive: true,
    });

    await page.goto(`/admin/subjects?q=${encodeURIComponent(dependencyFreeSubjectName)}`);
    await rowByText(page, dependencyFreeSubjectName)
      .getByRole("button", { name: /delete|archive/i })
      .click();
    await expect(page.getByText(/subject (deleted|archived)/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(dependencyFreeSubjectName)).toHaveCount(0);
  });
});

async function loginAsAdmin(page: Page) {
  await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);
  await page.goto("/admin/subjects");
  await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible({ timeout: 30000 });
}

async function loginAs(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(expectedPath, { timeout: 30000 });
}

async function createSubject(
  page: Page,
  input: {
    name: string;
    slug: string;
    description: string;
    priority: number;
    isActive: boolean;
  },
) {
  await page.goto("/admin/subjects/new");
  await page.getByLabel(/name/i).fill(input.name);
  await page.getByLabel(/slug/i).fill(input.slug);
  await page.getByLabel(/description/i).fill(input.description);
  await page.getByLabel(/priority/i).fill(String(input.priority));
  const activeControl = page.getByLabel(/active/i);
  if (input.isActive) {
    await activeControl.check();
  } else {
    await activeControl.uncheck();
  }
  await page.getByRole("button", { name: /create subject/i }).click();
  await expect(page.getByText(/subject created/i)).toBeVisible({ timeout: 30000 });
}

async function createScheduledClassWithSubject(
  page: Page,
  input: {
    title: string;
    subjectName: string;
  },
) {
  await page.goto("/admin/classes/new");
  await page.getByLabel(/title/i).fill(input.title);
  await page.getByLabel(/description/i).fill("Scheduled class linked to a managed subject.");
  await page.getByLabel(/start/i).fill("2026-06-12T10:00");
  await page.getByLabel(/end|duration/i).fill("2026-06-12T11:00");
  await page.getByLabel(/live lesson|url/i).fill("https://meet.example.com/qa-subject-class");
  await page.getByLabel(/teacher/i).selectOption({ label: "Fixed Teacher" });
  await page.getByLabel(/subject/i).selectOption({ label: input.subjectName });
  await page.getByRole("button", { name: /create.*class|save.*class/i }).click();
  await page.waitForURL(/\/admin\/classes(?:\?|$)/, { timeout: 30000 });
}

async function enrollStudentInClass(page: Page, classTitle: string) {
  await page.goto(`/admin/students/${studentUserId}/edit`);
  await expect(page.getByRole("heading", { level: 1, name: /edit.*student/i })).toBeVisible();
  await page.locator('select[name="classId"]').selectOption({ label: classTitle });
  await page.getByRole("button", { name: /enrol|enroll/i }).click();
  await page.waitForURL(/studentMessage=Class\+enrolled|studentMessage=Class%20enrolled/, {
    timeout: 30000,
  });
}

async function findSubjectId(slug: string) {
  const subject = await prisma.subject.findUniqueOrThrow({
    where: { slug },
    select: { id: true },
  });
  return subject.id;
}

function rowByText(page: Page, text: string) {
  return page.locator("tbody tr").filter({ hasText: text }).first();
}

async function ensurePortalUsers() {
  const passwordHash = await hashPassword(PASSWORD);
  const [admin, teacher, student] = await Promise.all([
    prisma.appUser.upsert({
      where: { email: ADMIN_EMAIL },
      update: { fullName: "Fixed Admin", role: UserRole.ADMIN, isActive: true, passwordHash },
      create: {
        id: "admin-123",
        email: ADMIN_EMAIL,
        fullName: "Fixed Admin",
        role: UserRole.ADMIN,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.upsert({
      where: { email: TEACHER_EMAIL },
      update: { fullName: "Fixed Teacher", role: UserRole.TEACHER, isActive: true, passwordHash },
      create: {
        id: "teacher-123",
        email: TEACHER_EMAIL,
        fullName: "Fixed Teacher",
        role: UserRole.TEACHER,
        passwordHash,
        isActive: true,
      },
    }),
    prisma.appUser.upsert({
      where: { email: STUDENT_EMAIL },
      update: {
        fullName: "QA Subject Student",
        role: UserRole.STUDENT,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash,
      },
      create: {
        id: "qa-subject-student",
        email: STUDENT_EMAIL,
        fullName: "QA Subject Student",
        role: UserRole.STUDENT,
        passwordHash,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
      },
    }),
  ]);

  adminUserId = admin.id;
  teacherUserId = teacher.id;
  studentUserId = student.id;
}

async function cleanupTestData() {
  await prisma.scheduledClass.deleteMany({
    where: { title: { startsWith: CLASS_PREFIX } },
  });
  await prisma.subject.deleteMany({
    where: { name: { startsWith: SUBJECT_PREFIX } },
  });
  await prisma.appUser.deleteMany({
    where: { email: STUDENT_EMAIL },
  });
}
