import { type Page, expect, test } from "@playwright/test";
import { ClassGroupStatus, PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const TEACHER_EMAIL = "fixed.teacher@uluglobalacademy.com";
const STUDENT_EMAIL = "fixed.admin-class.student@uluglobalacademy.com";
const ADMIN_NAME = "Fixed Admin";
const TEACHER_NAME = "Fixed Teacher";
const STUDENT_NAME = "Fixed Class Student";
const ADMIN_ID = "admin-123";
const TEACHER_ID = "teacher-123";
const STUDENT_ID = "fixed-admin-class-student-id";
const LESSON_PREFIX = "QA Lesson Lifecycle";
const GROUP_PREFIX = "QA Lesson Group";
const SUBJECT_SLUG_PREFIX = "qa-lesson-subject";
const LEVEL_SLUG_PREFIX = "qa-lesson-level";

let adminUserId = ADMIN_ID;
let teacherUserId = TEACHER_ID;
let studentUserId = STUDENT_ID;

function testMeetUrl(path: string) {
  return `https://meet.google.com/${path}`;
}

function toBase64Url(input: string) {
  return Buffer.from(input, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signPayload(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  const signatureString = Array.from(new Uint8Array(signature))
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return toBase64Url(signatureString);
}

async function createSessionToken(input: {
  uid: string;
  role: UserRole;
  email: string;
  fullName: string;
}) {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      uid: input.uid,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      exp: Date.now() + 1000 * 60 * 60,
      mfaVerified: true,
      authMethod: "password",
    }),
  );
  return `${payloadBase64}.${await signPayload(payloadBase64)}`;
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
      name: "ulu_session",
      value: await createSessionToken(input),
      domain: COOKIE_DOMAIN,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

test.describe("Admin Scheduled Lessons Management", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupLessonFixtures();
    await ensureUsers();
  });

  test.afterAll(async () => {
    await cleanupLessonFixtures();
    await prisma.$disconnect();
  });

  test("admin manages lesson lifecycle and portal visibility", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const group = await createLessonClassGroup(suffix);
    const lessonTitle = `${LESSON_PREFIX} ${suffix}`;
    const rescheduledStart = "2026-07-08T12:00";
    const rescheduledEnd = "2026-07-08T13:00";

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
    });

    await page.goto(`${BASE_URL}/admin/classes/${group.id}/lessons/new`);
    await expect(page.getByRole("heading", { name: /create lesson|new lesson/i })).toBeVisible();
    await page.getByLabel(/title/i).fill(lessonTitle);
    await page.getByLabel(/description/i).fill("Scheduled lesson lifecycle E2E.");
    await page.getByLabel(/start/i).fill("2026-07-07T10:00");
    await page.getByLabel(/end/i).fill("2026-07-07T11:00");
    await page.getByLabel(/live lesson|url/i).fill(testMeetUrl("qa-lesson-lifecycle"));
    await Promise.all([
      page.waitForURL(/classMessage=Lesson(?:\+|%20)created\.?/i, { timeout: 60000 }),
      page.getByRole("button", { name: /create lesson|save lesson/i }).click(),
    ]);
    await expect(page.getByText(/lesson created/i)).toBeVisible({ timeout: 30000 });

    const lesson = await prisma.scheduledClass.findFirstOrThrow({
      where: { title: lessonTitle, classGroupId: group.id },
      select: { id: true },
    });

    await setPortalSession(page, {
      uid: teacherUserId,
      role: UserRole.TEACHER,
      email: TEACHER_EMAIL,
      fullName: TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/teacher`);
    const teacherLesson = page.locator("main").filter({ hasText: lessonTitle });
    await expect(teacherLesson).toContainText(group.name);
    await expect(teacherLesson).toContainText(/available before lesson/i);
    await expect(teacherLesson.getByRole("link", { name: /start lesson/i })).toHaveCount(0);

    await setPortalSession(page, {
      uid: studentUserId,
      role: UserRole.STUDENT,
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-07`);
    const studentLesson = page.locator("article").filter({ hasText: lessonTitle });
    await expect(studentLesson).toBeVisible();
    await expect(studentLesson.getByRole("link", { name: /join/i })).toBeVisible();

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
    });
    await page.goto(`${BASE_URL}/admin/classes/${group.id}/lessons/${lesson.id}/edit`);
    await page.getByLabel(/start/i).fill(rescheduledStart);
    await page.getByLabel(/end/i).fill(rescheduledEnd);
    await Promise.all([
      page.waitForURL(/classMessage=Lesson(?:\+|%20)rescheduled\.?/i, { timeout: 60000 }),
      page.getByRole("button", { name: /reschedule|save lesson|update lesson/i }).click(),
    ]);
    await expect(page.getByText(/lesson rescheduled/i)).toBeVisible({ timeout: 30000 });

    await setPortalSession(page, {
      uid: studentUserId,
      role: UserRole.STUDENT,
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-07`);
    await expect(page.locator("article").filter({ hasText: lessonTitle })).toContainText(
      /rescheduled/i,
    );

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
    });
    await page.goto(`${BASE_URL}/admin/classes/${group.id}/lessons/${lesson.id}`);
    await page.getByRole("button", { name: /cancel lesson|cancel/i }).click();
    await page.getByLabel(/reason/i).fill("Instructor unavailable.");
    await Promise.all([
      page.waitForURL(/classMessage=Lesson(?:\+|%20)cancelled\.?/i, { timeout: 60000 }),
      page.getByRole("button", { name: /confirm cancel|cancel lesson/i }).click(),
    ]);
    await expect(page.getByText(/lesson cancelled/i)).toBeVisible({ timeout: 30000 });

    await setPortalSession(page, {
      uid: studentUserId,
      role: UserRole.STUDENT,
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-07`);
    const cancelledStudentLesson = page.locator("article").filter({ hasText: lessonTitle });
    await expect(cancelledStudentLesson).toContainText(/cancelled/i);
    await expect(cancelledStudentLesson).toContainText("Instructor unavailable.");
    await expect(cancelledStudentLesson.getByRole("link", { name: /join/i })).toHaveCount(0);

    await setPortalSession(page, {
      uid: teacherUserId,
      role: UserRole.TEACHER,
      email: TEACHER_EMAIL,
      fullName: TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/teacher/schedule?from=2026-07-01&to=2026-07-31`);
    const cancelledTeacherLesson = page.locator("article").filter({ hasText: lessonTitle });
    await expect(cancelledTeacherLesson).toContainText(/cancelled/i);
    await expect(cancelledTeacherLesson.getByRole("link", { name: /start lesson/i })).toHaveCount(
      0,
    );
  });

  test("admin creates recurring weekly lessons and duplicate dates are skipped", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const group = await createLessonClassGroup(suffix);
    const recurringTitle = `${LESSON_PREFIX} Recurring ${suffix}`;

    await prisma.scheduledClass.create({
      data: {
        title: recurringTitle,
        description: "Existing duplicate recurring lesson.",
        classGroupId: group.id,
        teacherId: teacherUserId,
        subjectId: group.subjectId,
        startAt: new Date("2026-07-14T07:00:00.000Z"),
        endAt: new Date("2026-07-14T08:00:00.000Z"),
        liveLessonUrl: testMeetUrl("qa-recurring-existing"),
      },
    });

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
    });

    await page.goto(`${BASE_URL}/admin/classes/${group.id}/lessons/new`);
    await page.getByRole("tab", { name: /recurring/i }).click();
    await page.getByLabel(/title/i).fill(recurringTitle);
    await page.getByLabel(/weekday.*tuesday|tuesday/i).check();
    await page.getByLabel(/start time/i).fill("10:00");
    await page.getByLabel(/duration/i).fill("60");
    await page.getByLabel(/start date/i).fill("2026-07-07");
    await page.getByLabel(/end date/i).fill("2026-07-28");
    await page.getByLabel(/live link strategy/i).selectOption("reuse");
    await page.getByLabel(/live lesson|url/i).fill(testMeetUrl("qa-recurring-weekly"));
    await page.getByRole("button", { name: /preview/i }).click();
    await expect(page.getByText(/4 lessons/i)).toBeVisible();
    await page.getByRole("button", { name: /create recurring lessons/i }).click();
    await expect(page.getByText(/created 3/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/skipped 1/i)).toBeVisible();
  });
});

async function ensureUsers() {
  const admin = await prisma.appUser.upsert({
    where: { email: ADMIN_EMAIL },
    update: { fullName: ADMIN_NAME, role: UserRole.ADMIN, isActive: true },
    create: {
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
      role: UserRole.ADMIN,
      passwordHash: "test-password-hash",
      isActive: true,
    },
  });
  adminUserId = admin.id;

  const teacher = await prisma.appUser.upsert({
    where: { email: TEACHER_EMAIL },
    update: { fullName: TEACHER_NAME, role: UserRole.TEACHER, isActive: true },
    create: {
      id: TEACHER_ID,
      email: TEACHER_EMAIL,
      fullName: TEACHER_NAME,
      role: UserRole.TEACHER,
      passwordHash: "test-password-hash",
      isActive: true,
    },
  });
  teacherUserId = teacher.id;

  await prisma.teacherAvailabilityRule.deleteMany({ where: { teacherId: teacherUserId } });
  await prisma.teacherAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({
      teacherId: teacherUserId,
      weekday: index + 1,
      startTime: "00:00",
      endTime: "23:59",
      timezone: "Africa/Nairobi",
    })),
  });

  const student = await prisma.appUser.upsert({
    where: { email: STUDENT_EMAIL },
    update: {
      fullName: STUDENT_NAME,
      role: UserRole.STUDENT,
      isActive: true,
      learningStatus: StudentLearningStatus.ACTIVE,
    },
    create: {
      id: STUDENT_ID,
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
      role: UserRole.STUDENT,
      passwordHash: "test-password-hash",
      isActive: true,
      learningStatus: StudentLearningStatus.ACTIVE,
    },
  });
  studentUserId = student.id;
}

async function createLessonClassGroup(suffix: string) {
  const subject = await prisma.subject.upsert({
    where: { slug: `${SUBJECT_SLUG_PREFIX}-${suffix}` },
    update: {
      name: `QA Lesson Subject ${suffix}`,
      description: "Subject fixture for scheduled lesson e2e.",
      isActive: true,
      priority: 95,
    },
    create: {
      slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      name: `QA Lesson Subject ${suffix}`,
      description: "Subject fixture for scheduled lesson e2e.",
      isActive: true,
      priority: 95,
    },
  });

  const level = await prisma.level.upsert({
    where: { slug: `${LEVEL_SLUG_PREFIX}-${suffix}` },
    update: {
      name: `QA Lesson Level ${suffix}`,
      description: "Level fixture for scheduled lesson e2e.",
    },
    create: {
      slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      name: `QA Lesson Level ${suffix}`,
      description: "Level fixture for scheduled lesson e2e.",
    },
  });

  return prisma.classGroup.create({
    data: {
      name: `${GROUP_PREFIX} ${suffix}`,
      description: "Class group fixture for scheduled lesson e2e.",
      subjectId: subject.id,
      levelId: level.id,
      teacherId: teacherUserId,
      status: ClassGroupStatus.ACTIVE,
      capacity: 8,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T00:00:00.000Z"),
      students: { connect: { id: studentUserId } },
    },
  });
}

async function cleanupLessonFixtures() {
  const groups = await prisma.classGroup.findMany({
    where: { name: { startsWith: GROUP_PREFIX } },
    select: { id: true },
  });

  await prisma.scheduledClass.deleteMany({
    where: {
      OR: [
        { title: { startsWith: LESSON_PREFIX } },
        { classGroupId: { in: groups.map((group) => group.id) } },
      ],
    },
  });
  await prisma.teacherAvailabilityRule.deleteMany({ where: { teacherId: teacherUserId } });

  for (const group of groups) {
    await prisma.classGroup.update({
      where: { id: group.id },
      data: { students: { set: [] } },
    });
  }

  await prisma.classGroup.deleteMany({
    where: { id: { in: groups.map((group) => group.id) } },
  });
  await prisma.subject.deleteMany({
    where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } },
  });
  await prisma.level.deleteMany({
    where: { slug: { startsWith: LEVEL_SLUG_PREFIX } },
  });
}
