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

function padDatePart(value: number) {
  return value.toString().padStart(2, "0");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatDateTimeInput(date: Date) {
  return `${formatDateInput(date)}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatMonthQuery(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

test.describe("Admin Subject Management", () => {
  test.describe.configure({ timeout: 540000, mode: "serial" });

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
    const lessonStart = addDays(new Date(), 14);
    lessonStart.setHours(10, 0, 0, 0);
    const lessonEnd = new Date(lessonStart);
    lessonEnd.setHours(11, 0, 0, 0);
    const scheduleMonth = formatMonthQuery(lessonStart);

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

    await createClassGroupWithSubject(page, {
      title: classTitle,
      subjectName: activeSubjectName,
      lessonStart,
      lessonEnd,
    });

    await page.goto(`/admin/classes?q=${encodeURIComponent(classTitle)}`);
    const classRow = rowByText(page, classTitle);
    await expect(classRow).toBeVisible();
    await expect(classRow).toContainText(activeSubjectName);

    await enrollStudentInClassGroup(page, classTitle);
    await createClassGroupLesson(page, {
      classGroupName: classTitle,
      lessonEnd,
      lessonStart,
      title: classTitle,
    });

    await loginAs(page, TEACHER_EMAIL, /\/portal\/teacher|\/admin\/security/);
    await page.goto("/portal/teacher");
    const teacherClassCard = page.locator("article").filter({ hasText: classTitle }).first();
    await expect(teacherClassCard).toBeVisible();
    await expect(teacherClassCard).toContainText(activeSubjectName);

    await loginAs(page, STUDENT_EMAIL, /\/portal\/student|\/admin\/security/);
    await page.goto(`/portal/schedule?month=${scheduleMonth}`);
    const studentScheduleClass = page.locator("article").filter({ hasText: classTitle }).first();
    await expect(studentScheduleClass).toBeVisible();
    await expect(studentScheduleClass).toContainText(activeSubjectName);

    await loginAsAdmin(page);
    await page.goto(`/admin/subjects?q=${encodeURIComponent(activeSubjectName)}`);
    const protectedSubjectRow = rowByText(page, activeSubjectName);
    await protectedSubjectRow.getByRole("button", { name: /delete|archive/i }).click();
    await expect(page.getByRole("dialog", { name: /delete subject/i })).toContainText(
      activeSubjectName,
    );
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("dialog", { name: /delete subject/i })).toHaveCount(0);
    await expect(protectedSubjectRow).toBeVisible();
    await protectedSubjectRow.getByRole("button", { name: /delete|archive/i }).click();
    await page.getByRole("button", { name: /confirm delete/i }).click();
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
    await expect(page.getByRole("dialog", { name: /delete subject/i })).toContainText(
      dependencyFreeSubjectName,
    );
    await page.getByRole("button", { name: /confirm delete/i }).click();
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
  await page.waitForURL(expectedPath, { timeout: 60000 });
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

async function selectFirstAvailableOption(page: Page, label: RegExp) {
  const select = page.getByLabel(label);
  const value = await select.locator("option").evaluateAll((options) => {
    const option = options.find((candidate) => {
      const value = candidate.getAttribute("value");
      return value !== null && value.trim() !== "";
    });
    return option?.getAttribute("value") ?? "";
  });
  expect(value).toBeTruthy();
  await select.selectOption(value);
}

async function createClassGroupWithSubject(
  page: Page,
  input: {
    lessonEnd: Date;
    lessonStart: Date;
    title: string;
    subjectName: string;
  },
) {
  await page.goto("/admin/classes/new");
  await page.getByLabel(/^name$/i).fill(input.title);
  await page.getByLabel(/description/i).fill("Scheduled class linked to a managed subject.");
  await page.getByLabel(/teacher/i).selectOption({ label: "Fixed Teacher" });
  await page.getByLabel(/subject/i).selectOption({ label: input.subjectName });
  await selectFirstAvailableOption(page, /level/i);
  await page.getByLabel(/capacity/i).fill("8");
  await page.getByLabel(/status/i).selectOption("ACTIVE");
  await page.getByLabel(/start date/i).fill(formatDateInput(input.lessonStart));
  await page.getByLabel(/end date/i).fill(formatDateInput(addDays(input.lessonEnd, 180)));
  await page.getByRole("button", { name: /create.*class group|save.*class group/i }).click();
  await page.waitForURL(/\/admin\/classes(?:\?|$)/, { timeout: 30000 });
}

async function openClassGroupDetail(page: Page, classTitle: string) {
  await page.goto(`/admin/classes?q=${encodeURIComponent(classTitle)}`);
  const classRow = rowByText(page, classTitle);
  await expect(classRow).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/admin\/classes\/[^/?]+$/, { timeout: 30000 }),
    classRow.getByRole("link", { name: /view|details/i }).click(),
  ]);
}

async function enrollStudentInClassGroup(page: Page, classTitle: string) {
  await openClassGroupDetail(page, classTitle);
  await page
    .getByRole("combobox", { name: /student/i })
    .selectOption({ label: "QA Subject Student" });
  await page.getByRole("button", { name: /add|enroll|enrol/i }).click();
  await page.waitForURL(/classMessage=Student(?:\+|%20)enrolled/i, { timeout: 30000 });
}

async function createClassGroupLesson(
  page: Page,
  input: {
    classGroupName: string;
    lessonEnd: Date;
    lessonStart: Date;
    title: string;
  },
) {
  await openClassGroupDetail(page, input.classGroupName);
  await page.getByRole("link", { name: /create lesson|new lesson/i }).click();
  await page.getByLabel(/title/i).fill(input.title);
  await page.getByLabel(/description/i).fill("Lesson linked to a managed subject.");
  await page.getByLabel(/start/i).fill(formatDateTimeInput(input.lessonStart));
  await page.getByLabel(/end|duration/i).fill(formatDateTimeInput(input.lessonEnd));
  await page.getByLabel(/live lesson|url/i).fill("https://meet.google.com/qa-subject-class");
  await page.getByRole("button", { name: /create lesson|save lesson/i }).click();
  await page.waitForURL(/\/admin\/classes\/[^/?]+(?:\?|$)/, { timeout: 30000 });
  await expect(page.getByText(/lesson created/i)).toBeVisible({ timeout: 30000 });
  const lessonsSection = page.getByRole("region", { name: /class group lessons/i });
  await expect(lessonsSection.locator("li").filter({ hasText: input.title }).first()).toBeVisible({
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

  await prisma.teacherAvailabilityRule.deleteMany({
    where: { teacherId: teacherUserId },
  });
  await prisma.teacherAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({
      teacherId: teacherUserId,
      weekday: index + 1,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "Europe/Kiev",
    })),
  });
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
  await prisma.teacherAvailabilityRule.deleteMany({
    where: { teacherId: teacherUserId },
  });
}
