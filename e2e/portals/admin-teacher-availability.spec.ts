import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import { ClassGroupStatus, PrismaClient, UserRole } from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const TEACHER_EMAIL = "fixed.teacher.availability@uluglobalacademy.com";
const OTHER_TEACHER_EMAIL = "fixed.other.teacher.availability@uluglobalacademy.com";
const ADMIN_NAME = "Fixed Admin";
const TEACHER_NAME = "Fixed Availability Teacher";
const OTHER_TEACHER_NAME = "Fixed Other Availability Teacher";
const ADMIN_ID = "admin-123";
const TEACHER_ID = "fixed-availability-teacher-id";
const OTHER_TEACHER_ID = "fixed-other-availability-teacher-id";
const TEACHER_PROFILE_PREFIX = "QA Availability Teacher";
const GROUP_PREFIX = "QA Availability Group";
const SUBJECT_SLUG_PREFIX = "qa-availability-subject";
const LEVEL_SLUG_PREFIX = "qa-availability-level";
const LESSON_PREFIX = "QA Availability Lesson";

const BASE_MONDAY = nextUtcWeekday(1, 35);
const BLOCKED_MONDAY = addUtcDays(BASE_MONDAY, 7);
const TEACHER_BLOCK_MONDAY = addUtcDays(BASE_MONDAY, 14);
const OTHER_TEACHER_BLOCK_TUESDAY = addUtcDays(BASE_MONDAY, 15);
const GROUP_START_DATE = addUtcDays(BASE_MONDAY, -5);
const GROUP_END_DATE = addUtcDays(BASE_MONDAY, 70);

let adminUserId = ADMIN_ID;
let teacherUserId = TEACHER_ID;
let otherTeacherUserId = OTHER_TEACHER_ID;
let classGroupId = "";

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextUtcWeekday(weekday: number, minDaysFromToday: number) {
  const next = new Date();
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + minDaysFromToday);
  const offset = (weekday - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function datePart(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDateTimeInput(date: Date, hour: number, minute = 0) {
  return `${datePart(date)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function setPortalSession(
  page: Page,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
  },
) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      domain: COOKIE_DOMAIN,
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      name: "ulu_session",
      path: "/",
      sameSite: "Lax",
      value: await createSessionToken(input),
    },
  ]);
}

test.describe("Admin Teacher Availability", () => {
  test.describe.configure({ timeout: 360000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    await ensureFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("admin configures teacher availability and lesson scheduling respects it", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const availableLessonTitle = `${LESSON_PREFIX} Available ${suffix}`;
    const outsideLessonTitle = `${LESSON_PREFIX} Outside ${suffix}`;
    const blockedLessonTitle = `${LESSON_PREFIX} Blocked ${suffix}`;
    const overlappingLessonTitle = `${LESSON_PREFIX} Overlap ${suffix}`;

    await setPortalSession(page, {
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
      role: UserRole.ADMIN,
      uid: adminUserId,
    });

    await page.goto(`${BASE_URL}/admin/teachers`);
    await expect(page.getByRole("heading", { name: /teachers/i })).toBeVisible();

    const teacherRow = page.locator("tr").filter({ hasText: TEACHER_NAME });
    await expect(teacherRow).toBeVisible();
    const availabilityLink = teacherRow.getByRole("link", { name: /availability/i });
    await expect(availabilityLink).toBeVisible({ timeout: 30000 });
    const availabilityHref = await availabilityLink.getAttribute("href");
    expect(availabilityHref).toMatch(/\/admin\/teachers\/.+\/availability/);
    await page.goto(`${BASE_URL}${availabilityHref}`);
    await expect(page.getByRole("heading", { name: /teacher availability/i })).toBeVisible();

    await page.getByLabel(/weekday/i).selectOption("1");
    await page.getByLabel(/start time/i).fill("09:00");
    await page.getByLabel(/end time/i).fill("12:00");
    await page.getByLabel(/timezone/i).fill("Africa/Nairobi");
    await page
      .getByRole("button", { name: /add availability|create rule|save availability/i })
      .click();
    await expect(page.getByText(/availability.*created|availability.*saved/i)).toBeVisible({
      timeout: 30000,
    });

    await createLesson(page, {
      endAt: utcDateTimeInput(BASE_MONDAY, 7),
      title: availableLessonTitle,
      startAt: utcDateTimeInput(BASE_MONDAY, 6),
    });
    await expect(page.getByText(/lesson created/i)).toBeVisible({ timeout: 30000 });

    await createLesson(page, {
      endAt: utcDateTimeInput(BASE_MONDAY, 16),
      title: outsideLessonTitle,
      startAt: utcDateTimeInput(BASE_MONDAY, 15),
    });
    await expect(page.getByText(/teacher is not available|outside availability/i)).toBeVisible({
      timeout: 30000,
    });

    await page.goto(`${BASE_URL}/admin/teachers/${teacherUserId}/availability`);
    await page.getByLabel(/unavailable start/i).fill(utcDateTimeInput(BLOCKED_MONDAY, 9, 30));
    await page.getByLabel(/unavailable end/i).fill(utcDateTimeInput(BLOCKED_MONDAY, 10, 30));
    await page.getByLabel(/reason/i).fill("Placement interview");
    await submitUnavailablePeriod(page);
    await expectUnavailablePeriodFeedback(page);

    await createLesson(page, {
      endAt: utcDateTimeInput(BLOCKED_MONDAY, 7),
      title: blockedLessonTitle,
      startAt: utcDateTimeInput(BLOCKED_MONDAY, 6),
    });
    await expect(page.getByText(/teacher is not available|unavailable period/i)).toBeVisible({
      timeout: 30000,
    });

    await createLesson(page, {
      endAt: utcDateTimeInput(BASE_MONDAY, 6, 30),
      title: overlappingLessonTitle,
      startAt: utcDateTimeInput(BASE_MONDAY, 6, 15),
    });
    await expect(page.getByText(/already booked|overlap|teacher is not available/i)).toBeVisible({
      timeout: 30000,
    });

    await setPortalSession(page, {
      email: TEACHER_EMAIL,
      fullName: TEACHER_NAME,
      role: UserRole.TEACHER,
      uid: teacherUserId,
    });

    await page.goto(`${BASE_URL}/portal/teacher/availability`);
    await expect(page.getByRole("heading", { name: /availability/i })).toBeVisible();
    await expect(page.getByText(/monday|mon/i)).toBeVisible();
    await expect(page.getByText(/09:00/)).toBeVisible();
    await expect(page.getByText(/12:00/)).toBeVisible();
    await expect(page.getByText(/placement interview/i)).toBeVisible();

    await page.getByLabel(/start/i).fill(utcDateTimeInput(TEACHER_BLOCK_MONDAY, 9));
    await page.getByLabel(/end/i).fill(utcDateTimeInput(TEACHER_BLOCK_MONDAY, 10));
    await page.getByLabel(/reason/i).fill("Teacher self-blocked time");
    await submitUnavailablePeriod(page);
    await expectUnavailablePeriodFeedback(page);

    await page.goto(`${BASE_URL}/portal/teacher/availability?teacherId=${otherTeacherUserId}`);
    await page.getByLabel(/start/i).fill(utcDateTimeInput(OTHER_TEACHER_BLOCK_TUESDAY, 9));
    await page.getByLabel(/end/i).fill(utcDateTimeInput(OTHER_TEACHER_BLOCK_TUESDAY, 10));
    await submitUnavailablePeriod(page);
    await expectUnavailablePeriodFeedback(page);
  });
});

async function createLesson(
  page: Page,
  input: {
    title: string;
    startAt: string;
    endAt: string;
  },
) {
  await page.goto(`${BASE_URL}/admin/classes/${classGroupId}/lessons/new`);
  await expect(page.getByRole("heading", { name: /create lesson|new lesson/i })).toBeVisible({
    timeout: 30000,
  });
  await page.getByLabel(/title/i).fill(input.title);
  await page.getByLabel(/description/i).fill("Teacher availability scheduling smoke test.");
  await page.getByLabel(/start/i).fill(input.startAt);
  await page.getByLabel(/end/i).fill(input.endAt);
  await page.getByLabel(/live lesson|url/i).fill("https://meet.google.com/avl-test-link");
  await Promise.all([
    page.waitForURL(
      (url) => url.searchParams.has("classMessage") || url.searchParams.has("classError"),
      { timeout: 60000 },
    ),
    page.getByRole("button", { name: /create lesson|save lesson/i }).click(),
  ]);
}

async function submitUnavailablePeriod(page: Page) {
  await Promise.all([
    page.waitForURL(/availabilityMessage=Unavailable(?:%20|\+)period(?:%20|\+)created/i, {
      timeout: 60000,
    }),
    page.getByRole("button", { name: /add unavailable period|save unavailable period/i }).click(),
  ]);
}

async function expectUnavailablePeriodFeedback(page: Page) {
  await expect(
    page.locator("output").filter({ hasText: /unavailable period.*created|period.*saved/i }),
  ).toBeVisible({ timeout: 30000 });
}

async function ensureFixtures() {
  const admin = await prisma.appUser.upsert({
    create: {
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
      id: ADMIN_ID,
      isActive: true,
      passwordHash: "test-password-hash",
      role: UserRole.ADMIN,
    },
    update: { fullName: ADMIN_NAME, isActive: true, role: UserRole.ADMIN },
    where: { email: ADMIN_EMAIL },
  });
  adminUserId = admin.id;

  const teacher = await prisma.appUser.upsert({
    create: {
      email: TEACHER_EMAIL,
      fullName: TEACHER_NAME,
      id: TEACHER_ID,
      isActive: true,
      passwordHash: "test-password-hash",
      role: UserRole.TEACHER,
    },
    update: { fullName: TEACHER_NAME, isActive: true, role: UserRole.TEACHER },
    where: { email: TEACHER_EMAIL },
  });
  teacherUserId = teacher.id;

  const otherTeacher = await prisma.appUser.upsert({
    create: {
      email: OTHER_TEACHER_EMAIL,
      fullName: OTHER_TEACHER_NAME,
      id: OTHER_TEACHER_ID,
      isActive: true,
      passwordHash: "test-password-hash",
      role: UserRole.TEACHER,
    },
    update: { fullName: OTHER_TEACHER_NAME, isActive: true, role: UserRole.TEACHER },
    where: { email: OTHER_TEACHER_EMAIL },
  });
  otherTeacherUserId = otherTeacher.id;

  const subject = await prisma.subject.upsert({
    create: {
      description: "Subject fixture for teacher availability e2e.",
      isActive: true,
      name: "QA Availability Mathematics",
      priority: 90,
      slug: `${SUBJECT_SLUG_PREFIX}-math`,
    },
    update: {
      description: "Subject fixture for teacher availability e2e.",
      isActive: true,
      name: "QA Availability Mathematics",
      priority: 90,
    },
    where: { slug: `${SUBJECT_SLUG_PREFIX}-math` },
  });

  const level = await prisma.level.upsert({
    create: {
      description: "Level fixture for teacher availability e2e.",
      name: "QA Availability Level",
      slug: `${LEVEL_SLUG_PREFIX}-igcse`,
    },
    update: {
      description: "Level fixture for teacher availability e2e.",
      name: "QA Availability Level",
    },
    where: { slug: `${LEVEL_SLUG_PREFIX}-igcse` },
  });

  const group = await prisma.classGroup.create({
    data: {
      capacity: 8,
      description: "Class group fixture for teacher availability e2e.",
      endDate: GROUP_END_DATE,
      levelId: level.id,
      name: `${GROUP_PREFIX} ${Date.now()}`,
      startDate: GROUP_START_DATE,
      status: ClassGroupStatus.ACTIVE,
      subjectId: subject.id,
      teacherId: teacherUserId,
    },
  });
  classGroupId = group.id;

  await prisma.teacher.create({
    data: {
      bio: "Teacher profile fixture for availability E2E.",
      cabinetUserId: teacherUserId,
      displayOrder: 3,
      fullName: TEACHER_NAME,
      isActive: true,
      title: "Availability Teacher",
    },
  });
}

async function cleanupFixtures() {
  const groups = await prisma.classGroup.findMany({
    select: { id: true },
    where: { name: { startsWith: GROUP_PREFIX } },
  });

  await prisma.scheduledClass.deleteMany({
    where: {
      OR: [
        { classGroupId: { in: groups.map((group) => group.id) } },
        { title: { startsWith: LESSON_PREFIX } },
      ],
    },
  });
  await prisma.teacherAvailabilityRule.deleteMany({
    where: { teacherId: { in: [teacherUserId, otherTeacherUserId, TEACHER_ID, OTHER_TEACHER_ID] } },
  });
  await prisma.teacherUnavailablePeriod.deleteMany({
    where: { teacherId: { in: [teacherUserId, otherTeacherUserId, TEACHER_ID, OTHER_TEACHER_ID] } },
  });
  await prisma.classGroup.deleteMany({
    where: { id: { in: groups.map((group) => group.id) } },
  });
  await prisma.teacher.deleteMany({
    where: {
      OR: [
        {
          cabinetUserId: { in: [teacherUserId, otherTeacherUserId, TEACHER_ID, OTHER_TEACHER_ID] },
        },
        { fullName: { startsWith: TEACHER_PROFILE_PREFIX } },
        { fullName: TEACHER_NAME },
      ],
    },
  });
  await prisma.subject.deleteMany({
    where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } },
  });
  await prisma.level.deleteMany({
    where: { slug: { startsWith: LEVEL_SLUG_PREFIX } },
  });
}
