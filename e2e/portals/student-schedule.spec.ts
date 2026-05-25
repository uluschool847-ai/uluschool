import { type Locator, type Page, expect, test } from "@playwright/test";
import {
  ClassGroupStatus,
  LessonStatus,
  PrismaClient,
  StudentLearningStatus,
  UserRole,
} from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.student-schedule.";
const LESSON_PREFIX = "QA Student Schedule Lesson";
const GROUP_PREFIX = "QA Student Schedule Group";
const SUBJECT_SLUG_PREFIX = "qa-student-schedule-subject";
const LEVEL_SLUG_PREFIX = "qa-student-schedule-level";

type ScheduleFixture = {
  parentId: string;
  parentEmail: string;
  parentName: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  siblingId: string;
  unlinkedStudentId: string;
  joinableLessonId: string;
  joinableLessonTitle: string;
  cancelledLessonTitle: string;
  completedLessonTitle: string;
  nextMonthLessonTitle: string;
  unlinkedLessonId: string;
  unlinkedLessonTitle: string;
  groupName: string;
  subjectName: string;
  levelName: string;
  teacherName: string;
  currentMonth: string;
  nextMonth: string;
};

let fixture: ScheduleFixture;

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
      authMethod: "password",
      email: input.email,
      exp: Date.now() + 1000 * 60 * 60,
      fullName: input.fullName,
      mfaVerified: true,
      role: input.role,
      uid: input.uid,
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

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateInMonth(base: Date, day: number, hour: number) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day, hour, 0, 0));
}

function nextMonthDate(base: Date, day: number, hour: number) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, day, hour, 0, 0));
}

function lessonCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

async function expectNoActiveJoin(card: Locator) {
  await expect(card.getByRole("link", { name: /join lesson/i })).toHaveCount(0);
  const disabledButton = card.getByRole("button", { name: /join lesson/i });
  if ((await disabledButton.count()) > 0) {
    await expect(disabledButton.first()).toBeDisabled();
  }
}

async function applyMonthFilter(page: Page, month: string) {
  await page.getByLabel(/month|period/i).fill(month);
  await page.getByRole("button", { name: /apply|filter|show schedule/i }).click();
}

test.describe("Student and parent schedule portals", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student sees only their own schedule lessons and lesson detail", async ({ page }) => {
    await setPortalSession(page, {
      email: fixture.studentEmail,
      fullName: fixture.studentName,
      role: UserRole.STUDENT,
      uid: fixture.studentId,
    });

    await page.goto(`${BASE_URL}/portal/student/schedule?month=${fixture.currentMonth}`);
    await expect(
      page.getByRole("heading", { name: /my schedule|student schedule/i }),
    ).toBeVisible();

    const joinableCard = lessonCard(page, fixture.joinableLessonTitle);
    await expect(joinableCard).toBeVisible();
    await expect(joinableCard).toContainText(fixture.subjectName);
    await expect(joinableCard).toContainText(fixture.teacherName);
    await expect(joinableCard).toContainText(fixture.groupName);
    await expect(joinableCard).toContainText(/Europe\/Kiev/i);
    await expect(joinableCard).toContainText(/live|scheduled/i);
    await expect(joinableCard).toContainText(/\d{1,2}:\d{2}/);
    await expect(page.getByText(fixture.unlinkedLessonTitle)).toHaveCount(0);

    const cancelledCard = lessonCard(page, fixture.cancelledLessonTitle);
    await expect(cancelledCard).toContainText(/cancelled/i);
    await expectNoActiveJoin(cancelledCard);

    const completedCard = lessonCard(page, fixture.completedLessonTitle);
    await expect(completedCard).toContainText(/completed/i);
    await expectNoActiveJoin(completedCard);

    const joinLink = joinableCard.getByRole("link", { name: /join lesson/i });
    await expect(joinLink).toHaveAttribute("target", "_blank");
    const popupPromise = page.waitForEvent("popup");
    await joinLink.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/meet\.google\.com/);
    await popup.close();

    await expect(page.getByText(fixture.nextMonthLessonTitle)).toHaveCount(0);
    await applyMonthFilter(page, fixture.nextMonth);
    await expect(page.getByText(fixture.nextMonthLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.joinableLessonTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/student/schedule?month=${fixture.currentMonth}`);
    await Promise.all([
      page.waitForURL(/\/portal\/student\/schedule\/[^/?]+$/, { timeout: 30000 }),
      lessonCard(page, fixture.joinableLessonTitle)
        .getByRole("link", { name: /details|view lesson|lesson details/i })
        .click(),
    ]);
    await expect(page.getByRole("heading", { name: fixture.joinableLessonTitle })).toBeVisible();
    await expect(page.getByText("Quadratics worksheet")).toBeVisible();
    await expect(page.getByText("Complete quadratic practice")).toBeVisible();
    await expect(page.getByText(/^Submission:\s*Graded$/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/schedule/${fixture.unlinkedLessonId}`);
    await expect(page.getByText(/not found|unauthorized|forbidden|not available/i)).toBeVisible();
    await expect(page.getByText(fixture.unlinkedLessonTitle)).toHaveCount(0);
  });

  test("parent sees only linked child schedules and scoped lesson detail", async ({ page }) => {
    await setPortalSession(page, {
      email: fixture.parentEmail,
      fullName: fixture.parentName,
      role: UserRole.PARENT,
      uid: fixture.parentId,
    });

    await page.goto(`${BASE_URL}/portal/parent/schedule?month=${fixture.currentMonth}`);
    await expect(
      page.getByRole("heading", { name: /child schedule|parent schedule/i }),
    ).toBeVisible();

    const childSelector = page.getByLabel(/child|student/i);
    await expect(childSelector).toBeVisible();
    await childSelector.selectOption(fixture.studentId);
    await page.getByRole("button", { name: /apply|filter|show schedule/i }).click();

    const linkedChildCard = lessonCard(page, fixture.joinableLessonTitle);
    await expect(linkedChildCard).toBeVisible();
    await expect(linkedChildCard).toContainText(fixture.studentName);
    await expect(page.getByText(fixture.unlinkedLessonTitle)).toHaveCount(0);

    await expect(linkedChildCard).toContainText(fixture.subjectName);
    await expect(linkedChildCard).toContainText(fixture.teacherName);
    await expect(linkedChildCard).toContainText(fixture.groupName);
    await expect(linkedChildCard).toContainText(/Europe\/Kiev/i);

    await Promise.all([
      page.waitForURL(/\/portal\/parent\/schedule\/[^/]+\/[^/?]+$/, { timeout: 30000 }),
      linkedChildCard.getByRole("link", { name: /details|view lesson|lesson details/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: fixture.joinableLessonTitle })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.subjectName)).toBeVisible();
    await expect(page.getByText("Quadratics worksheet")).toBeVisible();
    await expect(page.getByText("Complete quadratic practice")).toBeVisible();
    await expect(page.getByText(/^Submission:\s*Graded$/i)).toBeVisible();

    await page.goto(
      `${BASE_URL}/portal/parent/schedule/${fixture.unlinkedStudentId}/${fixture.unlinkedLessonId}`,
    );
    await expect(page.getByText(/not found|unauthorized|forbidden|not available/i)).toBeVisible();
    await expect(page.getByText(fixture.unlinkedLessonTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<ScheduleFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const currentMonth = monthKey(now);
  const nextMonth = monthKey(nextMonthDate(now, 1, 10));
  const joinableStart = new Date(Date.now() - 5 * 60 * 1000);
  const joinableEnd = new Date(Date.now() + 55 * 60 * 1000);
  const subjectName = `QA Student Schedule Mathematics ${suffix}`;
  const levelName = `QA Student Schedule Level ${suffix}`;
  const teacherName = `QA Student Schedule Teacher ${suffix}`;
  const studentName = `QA Student Schedule Student ${suffix}`;
  const siblingName = `QA Student Schedule Sibling ${suffix}`;
  const parentName = `QA Student Schedule Parent ${suffix}`;
  const unlinkedStudentName = `QA Student Schedule Unlinked ${suffix}`;
  const groupName = `${GROUP_PREFIX} ${suffix}`;
  const unlinkedGroupName = `${GROUP_PREFIX} Unlinked ${suffix}`;
  const joinableLessonTitle = `${LESSON_PREFIX} Joinable ${suffix}`;
  const cancelledLessonTitle = `${LESSON_PREFIX} Cancelled ${suffix}`;
  const completedLessonTitle = `${LESSON_PREFIX} Completed ${suffix}`;
  const nextMonthLessonTitle = `${LESSON_PREFIX} Next Month ${suffix}`;
  const unlinkedLessonTitle = `${LESSON_PREFIX} Hidden ${suffix}`;

  const [teacher, student, sibling, parent, unlinkedStudent, subject, level] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}teacher.${suffix}@example.com`,
        fullName: teacherName,
        isActive: true,
        passwordHash: "test-password-hash",
        role: UserRole.TEACHER,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}student.${suffix}@example.com`,
        fullName: studentName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "test-password-hash",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}sibling.${suffix}@example.com`,
        fullName: siblingName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "test-password-hash",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}parent.${suffix}@example.com`,
        fullName: parentName,
        isActive: true,
        passwordHash: "test-password-hash",
        role: UserRole.PARENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}unlinked.${suffix}@example.com`,
        fullName: unlinkedStudentName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "test-password-hash",
        role: UserRole.STUDENT,
      },
    }),
    prisma.subject.create({
      data: {
        description: "Subject fixture for student and parent schedule E2E.",
        isActive: true,
        name: subjectName,
        priority: 90,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Level fixture for student and parent schedule E2E.",
        name: levelName,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  await prisma.appUser.update({
    data: { children: { connect: [{ id: student.id }, { id: sibling.id }] } },
    where: { id: parent.id },
  });

  const [group, unlinkedGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 8,
        description: "Linked child class group for student schedule E2E.",
        endDate: nextMonthDate(now, 28, 0),
        levelId: level.id,
        name: groupName,
        startDate: dateInMonth(now, 1, 0),
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacher.id,
        students: { connect: { id: student.id } },
      },
    }),
    prisma.classGroup.create({
      data: {
        capacity: 8,
        description: "Unlinked child class group for schedule access checks.",
        endDate: nextMonthDate(now, 28, 0),
        levelId: level.id,
        name: unlinkedGroupName,
        startDate: dateInMonth(now, 1, 0),
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacher.id,
        students: { connect: { id: unlinkedStudent.id } },
      },
    }),
  ]);

  const joinableLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      description: "Joinable lesson with materials and homework context.",
      endAt: joinableEnd,
      liveLessonUrl: testMeetUrl("abc-defg-hij"),
      status: LessonStatus.LIVE,
      subjectId: subject.id,
      teacherId: teacher.id,
      timezone: "Europe/Kiev",
      title: joinableLessonTitle,
      startAt: joinableStart,
    },
  });

  await prisma.scheduledClass.createMany({
    data: [
      {
        cancelReason: "Teacher unavailable",
        cancelledAt: new Date(),
        classGroupId: group.id,
        description: "Cancelled lesson should not have an active join button.",
        endAt: dateInMonth(now, 20, 11),
        liveLessonUrl: testMeetUrl("cancel-led"),
        status: LessonStatus.CANCELLED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Europe/Kiev",
        title: cancelledLessonTitle,
        startAt: dateInMonth(now, 20, 10),
      },
      {
        classGroupId: group.id,
        description: "Completed lesson should not have an active join button.",
        endAt: dateInMonth(now, 21, 11),
        liveLessonUrl: testMeetUrl("completed"),
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Europe/Kiev",
        title: completedLessonTitle,
        startAt: dateInMonth(now, 21, 10),
      },
      {
        classGroupId: group.id,
        description: "Next month lesson for period filter checks.",
        endAt: nextMonthDate(now, 5, 11),
        liveLessonUrl: testMeetUrl("next-month"),
        rescheduledFromId: joinableLesson.id,
        status: LessonStatus.RESCHEDULED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Europe/Kiev",
        title: nextMonthLessonTitle,
        startAt: nextMonthDate(now, 5, 10),
      },
    ],
  });

  const unlinkedLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: unlinkedGroup.id,
      description: "Lesson that must stay hidden from the linked student and parent.",
      endAt: dateInMonth(now, 22, 11),
      liveLessonUrl: testMeetUrl("hidden"),
      status: LessonStatus.SCHEDULED,
      subjectId: subject.id,
      teacherId: teacher.id,
      timezone: "Europe/Kiev",
      title: unlinkedLessonTitle,
      startAt: dateInMonth(now, 22, 10),
    },
  });

  const assignment = await prisma.assignment.create({
    data: {
      description: "Homework visible from schedule lesson detail.",
      dueDate: nextMonthDate(now, 7, 12),
      scheduledClassId: joinableLesson.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      title: "Complete quadratic practice",
    },
  });

  await Promise.all([
    prisma.courseMaterial.create({
      data: {
        description: "Downloadable worksheet for the schedule detail page.",
        fileUrl: `${BASE_URL}/e2e-assets/quadratics-worksheet.pdf`,
        scheduledClassId: joinableLesson.id,
        teacherId: teacher.id,
        title: "Quadratics worksheet",
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/submissions/quadratics.pdf`,
        feedback: "Submitted for review",
        grade: 88,
        studentId: student.id,
      },
    }),
  ]);

  return {
    cancelledLessonTitle,
    completedLessonTitle,
    currentMonth,
    groupName,
    joinableLessonId: joinableLesson.id,
    joinableLessonTitle,
    levelName,
    nextMonth,
    nextMonthLessonTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    siblingId: sibling.id,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    subjectName,
    teacherName,
    unlinkedLessonId: unlinkedLesson.id,
    unlinkedLessonTitle,
    unlinkedStudentId: unlinkedStudent.id,
  };
}

async function cleanupFixtures() {
  const groups = await prisma.classGroup.findMany({
    select: { id: true },
    where: { name: { startsWith: GROUP_PREFIX } },
  });
  const lessons = await prisma.scheduledClass.findMany({
    select: { id: true },
    where: {
      OR: [
        { title: { startsWith: LESSON_PREFIX } },
        { classGroupId: { in: groups.map((group) => group.id) } },
      ],
    },
  });
  const lessonIds = lessons.map((lesson) => lesson.id);
  const users = await prisma.appUser.findMany({
    select: { id: true },
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
  });
  const userIds = users.map((user) => user.id);

  await prisma.submission.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { scheduledClassId: { in: lessonIds } } });
  await prisma.courseMaterial.deleteMany({ where: { scheduledClassId: { in: lessonIds } } });
  await prisma.scheduledClass.deleteMany({ where: { id: { in: lessonIds } } });

  for (const group of groups) {
    await prisma.classGroup.update({
      data: { students: { set: [] } },
      where: { id: group.id },
    });
  }

  await prisma.classGroup.deleteMany({ where: { id: { in: groups.map((group) => group.id) } } });
  await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
}
