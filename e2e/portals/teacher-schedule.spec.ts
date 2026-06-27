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

const USER_EMAIL_PREFIX = "qa.teacher-schedule.";
const LESSON_PREFIX = "QA Teacher Schedule Lesson";
const GROUP_PREFIX = "QA Teacher Schedule Group";
const SUBJECT_SLUG_PREFIX = "qa-teacher-schedule-subject";
const LEVEL_SLUG_PREFIX = "qa-teacher-schedule-level";

type TeacherScheduleFixture = {
  teacherAId: string;
  teacherAEmail: string;
  teacherAName: string;
  teacherBLessonId: string;
  teacherBLessonTitle: string;
  joinableLessonId: string;
  joinableLessonTitle: string;
  cancelledLessonId: string;
  cancelledLessonTitle: string;
  completedLessonTitle: string;
  rescheduledLessonId: string;
  rescheduledLessonTitle: string;
  missingLinkLessonTitle: string;
  groupId: string;
  groupName: string;
  subjectId: string;
  subjectName: string;
  fromDate: string;
  toDate: string;
  activeStudentName: string;
  inactiveStudentName: string;
};

let fixture: TeacherScheduleFixture;

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

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function lessonCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

async function expectNoActiveStart(card: Locator) {
  await expect(card.getByRole("link", { name: /start lesson/i })).toHaveCount(0);
  const disabledButton = card.getByRole("button", { name: /start lesson/i });
  if ((await disabledButton.count()) > 0) {
    await expect(disabledButton.first()).toBeDisabled();
  }
}

async function setFilter(page: Page, label: RegExp, value: string) {
  const control = page.getByLabel(label);
  const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === "select") {
    await control.selectOption(value);
    return;
  }
  await control.fill(value);
}

test.describe("Teacher schedule portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("teacher sees only own schedule lessons, lifecycle states, and lesson workspace", async ({
    page,
  }) => {
    await setPortalSession(page, {
      email: fixture.teacherAEmail,
      fullName: fixture.teacherAName,
      role: UserRole.TEACHER,
      uid: fixture.teacherAId,
    });

    await page.goto(
      `${BASE_URL}/portal/teacher/schedule?from=${fixture.fromDate}&to=${fixture.toDate}`,
    );
    await expect(page.getByRole("heading", { name: /teacher schedule/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /availability/i })).toHaveAttribute(
      "href",
      /\/portal\/teacher\/availability/,
    );

    const joinableCard = lessonCard(page, fixture.joinableLessonTitle);
    await expect(joinableCard).toBeVisible();
    await expect(joinableCard).toContainText(fixture.subjectName);
    await expect(joinableCard).toContainText(fixture.groupName);
    await expect(joinableCard).toContainText(/students:\s*2|roster:\s*2/i);
    await expect(joinableCard).toContainText(/scheduled|live/i);
    await expect(joinableCard).toContainText(/Europe\/Kiev/i);
    await expect(joinableCard).toContainText(/materials:\s*1/i);
    await expect(joinableCard).toContainText(/assignments:\s*1|homework:\s*1/i);
    await expect(joinableCard).toContainText(/pending submissions:\s*1/i);
    await expect(joinableCard).toContainText(fixture.activeStudentName);
    await expect(joinableCard).toContainText(fixture.inactiveStudentName);
    await expect(joinableCard).toContainText(/inactive/i);
    await expect(page.getByText(fixture.teacherBLessonTitle)).toHaveCount(0);

    const startLink = joinableCard.getByRole("link", { name: /start lesson/i });
    await expect(startLink).toHaveAttribute("target", "_blank");
    await expect(startLink).toHaveAttribute("rel", "noreferrer");
    const popupPromise = page.waitForEvent("popup");
    await startLink.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/meet\.google\.com/);
    await popup.close();

    const cancelledCard = lessonCard(page, fixture.cancelledLessonTitle);
    await expect(cancelledCard).toContainText(/cancelled/i);
    await expect(cancelledCard).toContainText(/teacher unavailable/i);
    await expectNoActiveStart(cancelledCard);

    const completedCard = lessonCard(page, fixture.completedLessonTitle);
    await expect(completedCard).toContainText(/completed/i);
    await expectNoActiveStart(completedCard);

    const rescheduledCard = lessonCard(page, fixture.rescheduledLessonTitle);
    await expect(rescheduledCard).toContainText(/rescheduled/i);

    const missingLinkCard = lessonCard(page, fixture.missingLinkLessonTitle);
    await expect(missingLinkCard).toContainText(/meeting link missing/i);
    await expectNoActiveStart(missingLinkCard);

    await setFilter(page, /^From$/i, fixture.fromDate);
    await setFilter(page, /^To$/i, fixture.toDate);
    await setFilter(page, /^Class group$/i, fixture.groupId);
    await setFilter(page, /^Subject$/i, fixture.subjectId);
    await page.locator('select[name="status"]').selectOption("CANCELLED");
    await page.getByRole("button", { name: /apply|filter|show schedule/i }).click();
    await expect(page.getByText(fixture.cancelledLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.joinableLessonTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/teacher/lessons/${fixture.joinableLessonId}`);
    await expect(page.getByRole("heading", { name: fixture.joinableLessonTitle })).toBeVisible();
    await expect(page.getByText(fixture.activeStudentName)).toBeVisible();
    await expect(page.getByText(fixture.inactiveStudentName)).toBeVisible();
    await expect(page.getByText(/inactive/i)).toBeVisible();
    await expect(page.getByText("Teacher schedule worksheet")).toBeVisible();
    await expect(page.getByText("Teacher schedule homework")).toBeVisible();
    await expect(page.getByText(/pending submissions:\s*1|1 pending/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /progress notes/i })).toBeVisible();
    await expect(
      page.getByText(/no current progress notes for this lesson roster yet/i),
    ).toBeVisible();
    await expect(page.getByText(/teacher progress route is not implemented/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /open progress/i }).first()).toHaveAttribute(
      "href",
      new RegExp(`/portal/teacher/progress\\?subjectId=${fixture.subjectId}`),
    );

    await page.goto(`${BASE_URL}/portal/teacher/lessons/${fixture.cancelledLessonId}`);
    await expect(page.getByText(/teacher unavailable/i)).toBeVisible();
    await expect(page.getByText(/status:\s*cancelled/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher/lessons/${fixture.rescheduledLessonId}`);
    await expect(page.getByText(/status:\s*rescheduled/i)).toBeVisible();
    await expect(page.getByText(/rescheduled from|original lesson/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher/lessons/${fixture.teacherBLessonId}`);
    await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
    await expect(page.getByText(fixture.teacherBLessonTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<TeacherScheduleFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const rangeStart = addMinutes(now, -24 * 60);
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = addMinutes(now, 2 * 24 * 60);
  rangeEnd.setUTCHours(23, 59, 59, 999);
  const teacherAName = `QA Teacher Schedule A ${suffix}`;
  const teacherBName = `QA Teacher Schedule B ${suffix}`;
  const activeStudentName = `QA Teacher Schedule Active Student ${suffix}`;
  const inactiveStudentName = `QA Teacher Schedule Inactive Student ${suffix}`;
  const subjectName = `QA Teacher Schedule Mathematics ${suffix}`;
  const levelName = `QA Teacher Schedule Level ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const teacherBGroupName = `${GROUP_PREFIX} B ${suffix}`;
  const joinableLessonTitle = `${LESSON_PREFIX} Joinable ${suffix}`;
  const cancelledLessonTitle = `${LESSON_PREFIX} Cancelled ${suffix}`;
  const completedLessonTitle = `${LESSON_PREFIX} Completed ${suffix}`;
  const rescheduledLessonTitle = `${LESSON_PREFIX} Rescheduled ${suffix}`;
  const missingLinkLessonTitle = `${LESSON_PREFIX} Missing Link ${suffix}`;
  const teacherBLessonTitle = `${LESSON_PREFIX} Teacher B Hidden ${suffix}`;

  const [teacherA, teacherB, activeStudent, inactiveStudent, teacherBStudent, subject, level] =
    await Promise.all([
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher-a.${suffix}@example.com`,
          fullName: teacherAName,
          isActive: true,
          passwordHash: "test-password-hash",
          role: UserRole.TEACHER,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher-b.${suffix}@example.com`,
          fullName: teacherBName,
          isActive: true,
          passwordHash: "test-password-hash",
          role: UserRole.TEACHER,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}active-student.${suffix}@example.com`,
          fullName: activeStudentName,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash: "test-password-hash",
          role: UserRole.STUDENT,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}inactive-student.${suffix}@example.com`,
          fullName: inactiveStudentName,
          isActive: false,
          learningStatus: StudentLearningStatus.PAUSED,
          passwordHash: "test-password-hash",
          role: UserRole.STUDENT,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher-b-student.${suffix}@example.com`,
          fullName: `QA Teacher Schedule B Student ${suffix}`,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash: "test-password-hash",
          role: UserRole.STUDENT,
        },
      }),
      prisma.subject.create({
        data: {
          description: "Subject fixture for teacher schedule E2E.",
          isActive: true,
          name: subjectName,
          priority: 91,
          slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
        },
      }),
      prisma.level.create({
        data: {
          description: "Level fixture for teacher schedule E2E.",
          name: levelName,
          slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
        },
      }),
    ]);

  const [group, teacherBGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        description: "Teacher A group for teacher schedule E2E.",
        endDate: rangeEnd,
        levelId: level.id,
        name: groupName,
        startDate: rangeStart,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacherA.id,
        students: { connect: [{ id: activeStudent.id }, { id: inactiveStudent.id }] },
      },
    }),
    prisma.classGroup.create({
      data: {
        capacity: 12,
        description: "Teacher B group that teacher A must not see.",
        endDate: rangeEnd,
        levelId: level.id,
        name: teacherBGroupName,
        startDate: rangeStart,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacherB.id,
        students: { connect: { id: teacherBStudent.id } },
      },
    }),
  ]);

  const joinableLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      description: "Joinable teacher schedule lesson with resources.",
      endAt: addMinutes(now, 55),
      liveLessonUrl: testMeetUrl("teacher-aaa-bbb"),
      status: LessonStatus.SCHEDULED,
      subjectId: subject.id,
      teacherId: teacherA.id,
      timezone: "Africa/Nairobi",
      title: joinableLessonTitle,
      startAt: addMinutes(now, -5),
    },
  });

  const cancelledLesson = await prisma.scheduledClass.create({
    data: {
      cancelReason: "Teacher unavailable",
      cancelledAt: new Date(),
      classGroupId: group.id,
      description: "Cancelled teacher schedule lesson.",
      endAt: addMinutes(now, 140),
      liveLessonUrl: testMeetUrl("teacher-cancelled"),
      status: LessonStatus.CANCELLED,
      subjectId: subject.id,
      teacherId: teacherA.id,
      timezone: "Africa/Nairobi",
      title: cancelledLessonTitle,
      startAt: addMinutes(now, 80),
    },
  });

  await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      description: "Completed teacher schedule lesson.",
      endAt: addMinutes(now, 220),
      liveLessonUrl: testMeetUrl("teacher-completed"),
      status: LessonStatus.COMPLETED,
      subjectId: subject.id,
      teacherId: teacherA.id,
      timezone: "Africa/Nairobi",
      title: completedLessonTitle,
      startAt: addMinutes(now, 160),
    },
  });

  const rescheduledLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      description: "Rescheduled teacher schedule lesson.",
      endAt: addMinutes(now, 300),
      liveLessonUrl: testMeetUrl("teacher-rescheduled"),
      rescheduledFromId: joinableLesson.id,
      status: LessonStatus.RESCHEDULED,
      subjectId: subject.id,
      teacherId: teacherA.id,
      timezone: "Africa/Nairobi",
      title: rescheduledLessonTitle,
      startAt: addMinutes(now, 240),
    },
  });

  await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      description: "Teacher schedule lesson with a missing meeting link.",
      endAt: addMinutes(now, 380),
      liveLessonUrl: "",
      status: LessonStatus.LIVE,
      subjectId: subject.id,
      teacherId: teacherA.id,
      timezone: "Africa/Nairobi",
      title: missingLinkLessonTitle,
      startAt: addMinutes(now, 320),
    },
  });

  const teacherBLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: teacherBGroup.id,
      description: "Teacher B lesson that teacher A must not see.",
      endAt: addMinutes(now, 460),
      liveLessonUrl: testMeetUrl("teacher-b-hidden"),
      status: LessonStatus.SCHEDULED,
      subjectId: subject.id,
      teacherId: teacherB.id,
      timezone: "Africa/Nairobi",
      title: teacherBLessonTitle,
      startAt: addMinutes(now, 400),
    },
  });

  const assignment = await prisma.assignment.create({
    data: {
      description: "Homework visible from teacher schedule detail.",
      dueDate: addMinutes(now, 24 * 60),
      scheduledClassId: joinableLesson.id,
      subjectId: subject.id,
      teacherId: teacherA.id,
      title: "Teacher schedule homework",
    },
  });

  await Promise.all([
    prisma.courseMaterial.create({
      data: {
        description: "Material visible from teacher schedule detail.",
        fileUrl: `${BASE_URL}/e2e-assets/teacher-schedule-worksheet.pdf`,
        scheduledClassId: joinableLesson.id,
        teacherId: teacherA.id,
        title: "Teacher schedule worksheet",
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/submissions/teacher-schedule.pdf`,
        feedback: "Ready for teacher review",
        grade: null,
        studentId: activeStudent.id,
      },
    }),
  ]);

  return {
    activeStudentName,
    cancelledLessonId: cancelledLesson.id,
    cancelledLessonTitle,
    completedLessonTitle,
    fromDate: dateInput(rangeStart),
    groupId: group.id,
    groupName,
    inactiveStudentName,
    joinableLessonId: joinableLesson.id,
    joinableLessonTitle,
    missingLinkLessonTitle,
    rescheduledLessonId: rescheduledLesson.id,
    rescheduledLessonTitle,
    subjectId: subject.id,
    subjectName,
    teacherAEmail: teacherA.email,
    teacherAId: teacherA.id,
    teacherAName,
    teacherBLessonId: teacherBLesson.id,
    teacherBLessonTitle,
    toDate: dateInput(rangeEnd),
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
