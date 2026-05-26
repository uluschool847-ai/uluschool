import { type Page, expect, test } from "@playwright/test";
import {
  AttendanceStatus,
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

const USER_EMAIL_PREFIX = "qa.parent-attendance.";
const LESSON_PREFIX = "QA Parent Attendance Lesson";
const GROUP_PREFIX = "QA Parent Attendance Group";
const SUBJECT_SLUG_PREFIX = "qa-parent-attendance-subject";
const LEVEL_SLUG_PREFIX = "qa-parent-attendance-level";

type ParentAttendanceFixture = {
  absentLessonTitle: string;
  childId: string;
  foreignChildId: string;
  foreignLessonTitle: string;
  groupName: string;
  lateLessonId: string;
  lateLessonTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  presentLessonTitle: string;
  subjectName: string;
};

let fixture: ParentAttendanceFixture;

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
  email: string;
  fullName: string;
  role: UserRole;
  uid: string;
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

async function setParentSession(page: Page) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      domain: COOKIE_DOMAIN,
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      name: "ulu_session",
      path: "/",
      sameSite: "Lax",
      value: await createSessionToken({
        email: fixture.parentEmail,
        fullName: fixture.parentName,
        role: UserRole.PARENT,
        uid: fixture.parentId,
      }),
    },
  ]);
}

function attendanceCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

test.describe("Parent attendance portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent reviews only linked-child attendance history read-only with filters", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);
    await Promise.all([
      page.waitForURL((url) =>
        `${url.pathname}${url.search}`.includes(`/portal/parent/attendance/${fixture.childId}`),
      ),
      page.getByRole("link", { name: /open attendance/i }).click(),
    ]);

    await expect(page.getByRole("heading", { name: /^attendance$/i })).toBeVisible();
    const summary = page.getByLabel(/attendance summary/i);
    await expect(summary.getByText(/^present\s*1$/i)).toBeVisible();
    await expect(summary.getByText(/^late\s*1$/i)).toBeVisible();
    await expect(summary.getByText(/^absent\s*1$/i)).toBeVisible();
    await expect(summary.getByText(/^total\s*3$/i)).toBeVisible();
    await expect(page.getByText(fixture.presentLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.lateLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.absentLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignLessonTitle)).toHaveCount(0);
    await expect(
      page.locator('button:has-text("Mark"), button:has-text("Update"), button:has-text("Delete")'),
    ).toHaveCount(0);
    await expect(page.locator('button:has-text("Save")')).toHaveCount(0);

    await page.locator('select[name="status"]').selectOption(AttendanceStatus.LATE);
    await page.getByRole("button", { name: /apply|filter|show attendance/i }).click();
    await expect(page.getByText(fixture.lateLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.presentLessonTitle)).toHaveCount(0);
    await expect(
      attendanceCard(page, fixture.lateLessonTitle).getByText(/bus delay/i),
    ).toBeVisible();

    await page.locator('select[name="status"]').selectOption("all");
    await page.getByLabel(/search/i).fill(fixture.subjectName);
    await page.getByRole("button", { name: /apply|filter|show attendance/i }).click();
    await expect(page.getByText(fixture.presentLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.subjectName).first()).toBeVisible();

    await Promise.all([
      page.waitForURL(
        new RegExp(`/portal/parent/schedule/${fixture.childId}/${fixture.lateLessonId}$`),
      ),
      attendanceCard(page, fixture.lateLessonTitle)
        .getByRole("link", { name: /view lesson|lesson detail/i })
        .click(),
    ]);
    await expect(page.getByRole("heading", { name: fixture.lateLessonTitle })).toBeVisible();

    const response = await page.goto(
      `${BASE_URL}/portal/parent/attendance/${fixture.foreignChildId}`,
    );
    expect([200, 404]).toContain(response?.status());
    await expect(page.getByText(fixture.foreignLessonTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<ParentAttendanceFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const parentName = `QA Parent Attendance Parent ${suffix}`;
  const childName = `QA Parent Attendance Child ${suffix}`;
  const foreignChildName = `QA Parent Attendance Foreign Child ${suffix}`;
  const teacherName = `QA Parent Attendance Teacher ${suffix}`;
  const subjectName = `QA Parent Attendance Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const presentLessonTitle = `${LESSON_PREFIX} Present ${suffix}`;
  const lateLessonTitle = `${LESSON_PREFIX} Late ${suffix}`;
  const absentLessonTitle = `${LESSON_PREFIX} Absent ${suffix}`;
  const foreignLessonTitle = `${LESSON_PREFIX} Foreign ${suffix}`;

  const [teacher, child, foreignChild, parent, subject, level] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}teacher.${suffix}@example.com`,
        fullName: teacherName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.TEACHER,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}child.${suffix}@example.com`,
        fullName: childName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}foreign-child.${suffix}@example.com`,
        fullName: foreignChildName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}parent.${suffix}@example.com`,
        fullName: parentName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.PARENT,
      },
    }),
    prisma.subject.create({
      data: {
        description: "Parent attendance E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Parent attendance E2E level",
        name: `QA Parent Attendance Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  await prisma.appUser.update({
    where: { id: parent.id },
    data: { children: { connect: { id: child.id } } },
  });

  const [group, foreignGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: groupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: child.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: `${GROUP_PREFIX} Foreign ${suffix}`,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: foreignChild.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
  ]);

  const [presentLesson, lateLesson, absentLesson, foreignLesson] = await Promise.all(
    [presentLessonTitle, lateLessonTitle, absentLessonTitle, foreignLessonTitle].map(
      (title, index) =>
        prisma.scheduledClass.create({
          data: {
            classGroupId: index === 3 ? foreignGroup.id : group.id,
            endAt: new Date(endAt.getTime() + index * 24 * 60 * 60 * 1000),
            startAt: new Date(startAt.getTime() + index * 24 * 60 * 60 * 1000),
            status: LessonStatus.COMPLETED,
            subjectId: subject.id,
            teacherId: teacher.id,
            timezone: "Europe/Kiev",
            title,
          },
        }),
    ),
  );

  await Promise.all([
    prisma.attendanceRecord.create({
      data: {
        markedAt: new Date(presentLesson.startAt.getTime() + 5 * 60 * 1000),
        markedById: teacher.id,
        scheduledClassId: presentLesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: child.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        lateMinutes: 11,
        markedAt: new Date(lateLesson.startAt.getTime() + 11 * 60 * 1000),
        markedById: teacher.id,
        reason: "Bus delay",
        scheduledClassId: lateLesson.id,
        status: AttendanceStatus.LATE,
        studentId: child.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: new Date(absentLesson.startAt.getTime() + 15 * 60 * 1000),
        markedById: teacher.id,
        reason: "Sick leave",
        scheduledClassId: absentLesson.id,
        status: AttendanceStatus.ABSENT,
        studentId: child.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: new Date(foreignLesson.startAt.getTime() + 5 * 60 * 1000),
        markedById: teacher.id,
        scheduledClassId: foreignLesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: foreignChild.id,
      },
    }),
  ]);

  return {
    absentLessonTitle,
    childId: child.id,
    foreignChildId: foreignChild.id,
    foreignLessonTitle,
    groupName,
    lateLessonId: lateLesson.id,
    lateLessonTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    presentLessonTitle,
    subjectName,
  };
}

async function cleanupFixtures() {
  await prisma.attendanceRecord.deleteMany({
    where: { scheduledClass: { title: { contains: LESSON_PREFIX } } },
  });
  await prisma.scheduledClass.deleteMany({ where: { title: { contains: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { contains: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
