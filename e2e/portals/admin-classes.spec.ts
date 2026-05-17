import { type Page, expect, test } from "@playwright/test";
import { PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_ID = "admin-123";
const PRIMARY_TEACHER_ID = "teacher-123";
const SECONDARY_TEACHER_ID = "teacher-456";
const STUDENT_ID = "fixed-admin-class-student-id";
const PARENT_ID = "fixed-admin-class-parent-id";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const TEACHER_EMAIL = "fixed.teacher@uluglobalacademy.com";
const SECONDARY_TEACHER_EMAIL = "fixed.teacher2@uluglobalacademy.com";
const STUDENT_EMAIL = "fixed.admin-class.student@uluglobalacademy.com";
const PARENT_EMAIL = "fixed.admin-class.parent@uluglobalacademy.com";
const PRIMARY_TEACHER_NAME = "Fixed Teacher";
const SECONDARY_TEACHER_NAME = "Fixed Teacher Two";
const STUDENT_NAME = "Fixed Class Student";
const PARENT_NAME = "Fixed Class Parent";
const CLASS_GROUP_PREFIX = "QA Class Group";
const CLASS_GROUP_SUBJECT_PREFIX = "QA Class Group Subject";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
let adminUserId = ADMIN_ID;
let primaryTeacherUserId = PRIMARY_TEACHER_ID;
let secondaryTeacherUserId = SECONDARY_TEACHER_ID;
let studentUserId = STUDENT_ID;
let parentUserId = PARENT_ID;

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
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

test.describe("Admin Scheduled Classes Management", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupClassGroupFixtures();
    await prisma.scheduledClass.deleteMany({
      where: { title: { startsWith: "QA Scheduled Class " } },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: CLASS_GROUP_SUBJECT_PREFIX } },
    });
    const admin = await prisma.appUser.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        fullName: "Fixed Admin",
        role: UserRole.ADMIN,
        isActive: true,
      },
      create: {
        id: ADMIN_ID,
        email: ADMIN_EMAIL,
        fullName: "Fixed Admin",
        role: UserRole.ADMIN,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    });
    adminUserId = admin.id;

    const primaryTeacher = await prisma.appUser.upsert({
      where: { email: TEACHER_EMAIL },
      update: {
        fullName: PRIMARY_TEACHER_NAME,
        role: UserRole.TEACHER,
        isActive: true,
      },
      create: {
        id: PRIMARY_TEACHER_ID,
        email: TEACHER_EMAIL,
        fullName: PRIMARY_TEACHER_NAME,
        role: UserRole.TEACHER,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    });
    primaryTeacherUserId = primaryTeacher.id;

    const secondaryTeacher = await prisma.appUser.upsert({
      where: { email: SECONDARY_TEACHER_EMAIL },
      update: {
        fullName: SECONDARY_TEACHER_NAME,
        role: UserRole.TEACHER,
        isActive: true,
      },
      create: {
        id: SECONDARY_TEACHER_ID,
        email: SECONDARY_TEACHER_EMAIL,
        fullName: SECONDARY_TEACHER_NAME,
        role: UserRole.TEACHER,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    });
    secondaryTeacherUserId = secondaryTeacher.id;

    await prisma.teacherAvailabilityRule.deleteMany({
      where: { teacherId: { in: [primaryTeacherUserId, secondaryTeacherUserId] } },
    });
    await prisma.teacherAvailabilityRule.createMany({
      data: [primaryTeacherUserId, secondaryTeacherUserId].flatMap((teacherId) =>
        Array.from({ length: 7 }, (_, index) => ({
          teacherId,
          weekday: index + 1,
          startTime: "00:00",
          endTime: "23:59",
          timezone: "Europe/Kiev",
        })),
      ),
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

    const parent = await prisma.appUser.upsert({
      where: { email: PARENT_EMAIL },
      update: {
        fullName: PARENT_NAME,
        role: UserRole.PARENT,
        isActive: true,
        children: { connect: { id: studentUserId } },
      },
      create: {
        id: PARENT_ID,
        email: PARENT_EMAIL,
        fullName: PARENT_NAME,
        role: UserRole.PARENT,
        passwordHash: "test-password-hash",
        isActive: true,
        children: { connect: { id: studentUserId } },
      },
    });
    parentUserId = parent.id;
  });

  test.afterAll(async () => {
    await cleanupClassGroupFixtures();
    await prisma.scheduledClass.deleteMany({
      where: {
        OR: [
          { title: { startsWith: "QA Scheduled Class " } },
          { title: { startsWith: CLASS_GROUP_PREFIX } },
        ],
      },
    });
    await prisma.subject.deleteMany({
      where: { name: { startsWith: CLASS_GROUP_SUBJECT_PREFIX } },
    });
    await prisma.$disconnect();
  });

  test("admin manages class groups, group lessons, and portal visibility through group enrollment", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const groupName = `${CLASS_GROUP_PREFIX} ${suffix}`;
    const lessonTitle = `${groupName} Lesson`;
    const dependencyFreeGroupName = `${CLASS_GROUP_PREFIX} Delete ${suffix}`;
    const subjectName = `${CLASS_GROUP_SUBJECT_PREFIX} ${suffix}`;
    const levelName = await ensureClassGroupLevel();
    const subject = await ensureClassGroupSubject(subjectName, suffix);
    const level = await prisma.level.findFirstOrThrow({
      where: { name: levelName },
      select: { id: true },
    });

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto(`${BASE_URL}/admin/classes/new`);
    await expect(
      page.getByRole("heading", { name: /create.*class group|new.*class/i }),
    ).toBeVisible();
    await page.getByLabel(/^name$/i).fill(groupName);
    await page.getByLabel(/description/i).fill("Created by admin class groups e2e.");
    await page.getByLabel(/teacher/i).selectOption(primaryTeacherUserId);
    await page.getByLabel(/subject/i).selectOption({ label: subjectName });
    await page.getByLabel(/level/i).selectOption({ label: levelName });
    await page.getByLabel(/capacity/i).fill("8");
    await page.getByLabel(/status/i).selectOption("ACTIVE");
    await page.getByLabel(/start date/i).fill("2026-05-18");
    await page.getByLabel(/end date/i).fill("2026-12-15");
    await page.getByRole("button", { name: /create.*class group|save.*class group/i }).click();
    await page.waitForURL(/\/admin\/classes(?:\?|$)/, { timeout: 30000 });

    await page.goto(`${BASE_URL}/admin/classes?q=${encodeURIComponent(groupName)}`);
    const groupRow = rowByText(page, groupName);
    await expect(groupRow).toBeVisible();
    await expect(groupRow).toContainText(PRIMARY_TEACHER_NAME);
    await expect(groupRow).toContainText(subjectName);
    await expect(groupRow).toContainText(levelName);
    await expect(groupRow).toContainText(/0\s*\/\s*8|capacity:\s*8/i);

    await Promise.all([
      page.waitForURL(/\/admin\/classes\/[^/?]+$/, { timeout: 30000 }),
      groupRow.getByRole("link", { name: /view|details/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: groupName })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole("combobox", { name: /student/i }).selectOption({ label: STUDENT_NAME });
    await page.getByRole("button", { name: /add|enroll|enrol/i }).click();
    await page.waitForURL(/classMessage=Student(?:\+|%20)enrolled/i, { timeout: 30000 });
    await expect(page.getByText(/student.*enrolled/i)).toBeVisible({ timeout: 30000 });
    await expect(
      page.locator('section[aria-label="Student enrollments"]').getByText(STUDENT_NAME, {
        exact: true,
      }),
    ).toBeVisible();

    await page.getByRole("link", { name: /create lesson|new lesson/i }).click();
    await page.getByLabel(/title/i).fill(lessonTitle);
    await page.getByLabel(/description/i).fill("Lesson inside the class group.");
    await page.getByLabel(/start/i).fill("2026-05-18T10:00");
    await page.getByLabel(/end|duration/i).fill("2026-05-18T11:00");
    await page.getByLabel(/live lesson|url/i).fill(testMeetUrl("qa-class-group-lesson"));
    await page.getByRole("button", { name: /create lesson|save lesson/i }).click();
    await expect(page.getByText(lessonTitle)).toBeVisible({ timeout: 30000 });

    await setPortalSession(page, {
      uid: primaryTeacherUserId,
      role: UserRole.TEACHER,
      email: TEACHER_EMAIL,
      fullName: PRIMARY_TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/teacher`);
    await expect(page.getByText(groupName).first()).toBeVisible();
    await expect(page.getByText(lessonTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();

    await setPortalSession(page, {
      uid: studentUserId,
      role: UserRole.STUDENT,
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-05`);
    await expect(page.getByText(lessonTitle)).toBeVisible();
    await expect(page.getByText(`Group: ${groupName}`)).toBeVisible();
    await expect(page.getByText("Unrelated Group Lesson")).toHaveCount(0);

    await setPortalSession(page, {
      uid: parentUserId,
      role: UserRole.PARENT,
      email: PARENT_EMAIL,
      fullName: PARENT_NAME,
    });
    await page.goto(`${BASE_URL}/portal/parent`);
    await expect(page.getByText(lessonTitle)).toBeVisible();
    await expect(page.getByText(`Group: ${groupName}`)).toBeVisible();

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });
    await page.goto(`${BASE_URL}/admin/classes?q=${encodeURIComponent(groupName)}`);
    await Promise.all([
      page.waitForURL(/\/admin\/classes\/[^/?]+\/edit$/, { timeout: 30000 }),
      rowByText(page, groupName).getByRole("link", { name: /edit/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /edit class group/i })).toBeVisible({
      timeout: 30000,
    });
    await page.getByLabel(/teacher/i).selectOption(secondaryTeacherUserId);
    await page.getByRole("button", { name: /save|update/i }).click();
    await expect(page.getByText(/class group.*updated/i)).toBeVisible({ timeout: 30000 });

    await setPortalSession(page, {
      uid: primaryTeacherUserId,
      role: UserRole.TEACHER,
      email: TEACHER_EMAIL,
      fullName: PRIMARY_TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-05`);
    await expect(page.getByText(lessonTitle)).toHaveCount(0);

    await setPortalSession(page, {
      uid: secondaryTeacherUserId,
      role: UserRole.TEACHER,
      email: SECONDARY_TEACHER_EMAIL,
      fullName: SECONDARY_TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-05`);
    await expect(page.getByText(lessonTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Group: ${groupName}`).first()).toBeVisible();

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });
    await page.goto(`${BASE_URL}/admin/classes?q=${encodeURIComponent(groupName)}`);
    await rowByText(page, groupName)
      .getByRole("button", { name: /delete|archive/i })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: /dependencies|cannot be deleted/i }),
    ).toBeVisible();

    await prisma.classGroup.create({
      data: {
        name: dependencyFreeGroupName,
        teacherId: secondaryTeacherUserId,
        subjectId: subject.id,
        levelId: level.id,
        capacity: 1,
      },
    });
    await page.goto(`${BASE_URL}/admin/classes?q=${encodeURIComponent(dependencyFreeGroupName)}`);
    const dependencyFreeRow = rowByText(page, dependencyFreeGroupName);
    await expect(dependencyFreeRow).toBeVisible();
    await dependencyFreeRow.getByRole("button", { name: /delete|archive/i }).click();
    await expect(page.getByText(/class group.*(deleted|archived)/i)).toBeVisible({
      timeout: 30000,
    });
  });

  test("legacy direct scheduled class teacher portal visibility remains compatible", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const classTitle = `QA Scheduled Class Teacher Portal ${suffix}`;

    await prisma.scheduledClass.create({
      data: {
        title: classTitle,
        description: "Legacy direct scheduled class for teacher portal compatibility.",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        liveLessonUrl: testMeetUrl("qa-legacy-teacher-portal"),
        teacherId: primaryTeacherUserId,
        students: { connect: { id: studentUserId } },
      },
    });

    await setPortalSession(page, {
      uid: primaryTeacherUserId,
      role: UserRole.TEACHER,
      email: TEACHER_EMAIL,
      fullName: PRIMARY_TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/teacher`);
    await expect(page.locator("main").getByText(classTitle).first()).toBeVisible();
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();
  });

  test("legacy scheduled class enrollment links stay visible and contextual", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const enrollmentTitle = `QA Scheduled Class Enrollment Target ${suffix}`;

    const enrollmentClass = await prisma.scheduledClass.create({
      data: {
        title: enrollmentTitle,
        description: "Target class for the enroll-students handoff.",
        startAt: new Date("2026-06-10T10:00:00.000Z"),
        endAt: new Date("2026-06-10T11:00:00.000Z"),
        liveLessonUrl: testMeetUrl("qa-enrollment-target"),
        teacherId: primaryTeacherUserId,
      },
    });

    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto(`${BASE_URL}/admin/students?classId=${enrollmentClass.id}`);
    await expect(page.getByText(`Enrollment target: ${enrollmentTitle}.`)).toBeVisible();
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: STUDENT_NAME })
        .getByRole("link", { name: /edit/i }),
    ).toHaveAttribute(
      "href",
      `/admin/students/${studentUserId}/edit?classId=${enrollmentClass.id}`,
    );

    await page.goto(
      `${BASE_URL}/admin/students/${studentUserId}/edit?classId=${enrollmentClass.id}`,
    );
    await expect(page.locator('select[name="classId"]')).toHaveValue(enrollmentClass.id);
  });

  test("portal schedule shows assigned and enrolled classes for teachers and students", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const classTitle = `QA Scheduled Class Portal Schedule ${suffix}`;
    const hiddenTitle = `QA Scheduled Class Portal Hidden ${suffix}`;
    const liveLessonUrl = testMeetUrl("qa-portal-schedule");

    await prisma.scheduledClass.create({
      data: {
        title: classTitle,
        description: "Visible to the assigned teacher and enrolled student in portal schedule.",
        startAt: new Date("2026-06-11T10:00:00.000Z"),
        endAt: new Date("2026-06-11T11:00:00.000Z"),
        liveLessonUrl,
        teacherId: primaryTeacherUserId,
        students: { connect: { id: studentUserId } },
      },
    });
    await prisma.scheduledClass.create({
      data: {
        title: hiddenTitle,
        description: "Should not be visible to the fixed teacher or fixed student.",
        startAt: new Date("2026-06-11T12:00:00.000Z"),
        endAt: new Date("2026-06-11T13:00:00.000Z"),
        liveLessonUrl: testMeetUrl("qa-hidden-schedule"),
        teacherId: secondaryTeacherUserId,
      },
    });

    await setPortalSession(page, {
      uid: primaryTeacherUserId,
      role: UserRole.TEACHER,
      email: TEACHER_EMAIL,
      fullName: PRIMARY_TEACHER_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-06`);
    await expect(page.getByRole("heading", { name: "Class Calendar" })).toBeVisible();
    const teacherScheduleClass = page.locator("article").filter({ hasText: classTitle });
    await expect(teacherScheduleClass).toBeVisible();
    await expect(teacherScheduleClass).toContainText(`Teacher: ${PRIMARY_TEACHER_NAME}`);
    await expect(
      teacherScheduleClass.getByRole("link", { name: "Join Live Lesson" }),
    ).toHaveAttribute("href", liveLessonUrl);
    await expect(page.getByText(hiddenTitle)).toHaveCount(0);

    await setPortalSession(page, {
      uid: studentUserId,
      role: UserRole.STUDENT,
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
    });
    await page.goto(`${BASE_URL}/portal/schedule?month=2026-06`);
    await expect(page.getByRole("heading", { name: "Class Calendar" })).toBeVisible();
    const studentScheduleClass = page.locator("article").filter({ hasText: classTitle });
    await expect(studentScheduleClass).toBeVisible();
    await expect(studentScheduleClass).toContainText(`Teacher: ${PRIMARY_TEACHER_NAME}`);
    await expect(
      studentScheduleClass.getByRole("link", { name: "Join Live Lesson" }),
    ).toHaveAttribute("href", liveLessonUrl);
    await expect(page.getByText(hiddenTitle)).toHaveCount(0);
  });
});

function rowByText(page: Page, text: string) {
  return page.locator("tbody tr").filter({ hasText: text }).first();
}

async function ensureClassGroupSubject(subjectName: string, suffix: string) {
  return prisma.subject.upsert({
    where: { slug: `qa-class-group-subject-${suffix}` },
    update: {
      name: subjectName,
      description: "Subject fixture for class group e2e.",
      isActive: true,
      priority: 91,
    },
    create: {
      slug: `qa-class-group-subject-${suffix}`,
      name: subjectName,
      description: "Subject fixture for class group e2e.",
      isActive: true,
      priority: 91,
    },
  });
}

async function ensureClassGroupLevel() {
  const existingLevel = await prisma.level.findFirst({
    orderBy: { name: "asc" },
    select: { name: true },
  });
  if (existingLevel) {
    return existingLevel.name;
  }

  const level = await prisma.level.create({
    data: {
      slug: "qa-class-group-level",
      name: "QA Class Group Level",
      description: "Level fixture for class group e2e.",
    },
    select: { name: true },
  });
  return level.name;
}

async function cleanupClassGroupFixtures() {
  await prisma.scheduledClass.deleteMany({
    where: { title: { startsWith: CLASS_GROUP_PREFIX } },
  });

  const groups = await prisma.classGroup.findMany({
    where: { name: { startsWith: CLASS_GROUP_PREFIX } },
    select: { id: true },
  });

  for (const group of groups) {
    await prisma.classGroup.update({
      where: { id: group.id },
      data: { students: { set: [] } },
    });
  }

  await prisma.classGroup.deleteMany({
    where: { id: { in: groups.map((group) => group.id) } },
  });
  await prisma.teacherAvailabilityRule.deleteMany({
    where: { teacherId: { in: [primaryTeacherUserId, secondaryTeacherUserId] } },
  });
}
