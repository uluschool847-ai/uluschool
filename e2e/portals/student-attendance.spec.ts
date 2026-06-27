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

const USER_EMAIL_PREFIX = "qa.student-attendance.";
const LESSON_PREFIX = "QA Student Attendance Lesson";
const GROUP_PREFIX = "QA Student Attendance Group";
const SUBJECT_SLUG_PREFIX = "qa-student-attendance-subject";
const LEVEL_SLUG_PREFIX = "qa-student-attendance-level";

type StudentAttendanceFixture = {
  absentLessonTitle: string;
  foreignLessonId: string;
  foreignLessonTitle: string;
  groupName: string;
  lateLessonId: string;
  lateLessonTitle: string;
  presentLessonTitle: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  subjectName: string;
};

let fixture: StudentAttendanceFixture;

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

async function setStudentSession(page: Page) {
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
        email: fixture.studentEmail,
        fullName: fixture.studentName,
        role: UserRole.STUDENT,
        uid: fixture.studentId,
      }),
    },
  ]);
}

function attendanceCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

test.describe("Student attendance portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student can review, filter, search, and open only their own attendance history", async ({
    page,
  }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student/attendance`);

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

    const statusFilter = page.locator('select[name="status"]');

    await statusFilter.selectOption(AttendanceStatus.PRESENT);
    await page.getByRole("button", { name: /apply|filter|show attendance/i }).click();
    await expect(page.getByText(fixture.presentLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.lateLessonTitle)).toHaveCount(0);

    await statusFilter.selectOption(AttendanceStatus.LATE);
    await page.getByRole("button", { name: /apply|filter|show attendance/i }).click();
    await expect(page.getByText(fixture.lateLessonTitle)).toBeVisible();
    await expect(
      attendanceCard(page, fixture.lateLessonTitle).getByText(/bus delay/i),
    ).toBeVisible();

    await statusFilter.selectOption(AttendanceStatus.ABSENT);
    await page.getByRole("button", { name: /apply|filter|show attendance/i }).click();
    await expect(page.getByText(fixture.absentLessonTitle)).toBeVisible();

    await statusFilter.selectOption("all");
    await page.getByLabel(/search/i).fill(fixture.subjectName);
    await page.getByRole("button", { name: /apply|filter|show attendance/i }).click();
    await expect(page.getByText(fixture.presentLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.subjectName).first()).toBeVisible();

    await Promise.all([
      page.waitForURL(new RegExp(`/portal/student/schedule/${fixture.lateLessonId}$`)),
      attendanceCard(page, fixture.lateLessonTitle)
        .getByRole("link", { name: /view lesson|lesson detail/i })
        .click(),
    ]);
    await expect(page.getByRole("heading", { name: fixture.lateLessonTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
    await expect(page.getByText(/attendance:\s*late/i)).toBeVisible();
    await expect(page.getByText(/late minutes:\s*11/i)).toBeVisible();
    await expect(page.getByText(/bus delay/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/schedule/${fixture.foreignLessonId}`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|not available/i).first(),
    ).toBeVisible();
    await expect(page.getByText(fixture.foreignLessonTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<StudentAttendanceFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const studentName = `QA Student Attendance Student ${suffix}`;
  const foreignStudentName = `QA Student Attendance Foreign Student ${suffix}`;
  const teacherName = `QA Student Attendance Teacher ${suffix}`;
  const subjectName = `QA Student Attendance Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const presentLessonTitle = `${LESSON_PREFIX} Present ${suffix}`;
  const lateLessonTitle = `${LESSON_PREFIX} Late ${suffix}`;
  const absentLessonTitle = `${LESSON_PREFIX} Absent ${suffix}`;
  const foreignLessonTitle = `${LESSON_PREFIX} Foreign ${suffix}`;

  const [teacher, student, foreignStudent, subject, level] = await Promise.all([
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
        email: `${USER_EMAIL_PREFIX}student.${suffix}@example.com`,
        fullName: studentName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}foreign-student.${suffix}@example.com`,
        fullName: foreignStudentName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.subject.create({
      data: {
        description: "Student attendance E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student attendance E2E level",
        name: `QA Student Attendance Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  const [group, foreignGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: groupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: student.id }] },
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
        students: { connect: [{ id: foreignStudent.id }] },
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
            timezone: "Africa/Nairobi",
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
        studentId: student.id,
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
        studentId: student.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: new Date(absentLesson.startAt.getTime() + 15 * 60 * 1000),
        markedById: teacher.id,
        reason: "Sick leave",
        scheduledClassId: absentLesson.id,
        status: AttendanceStatus.ABSENT,
        studentId: student.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: new Date(foreignLesson.startAt.getTime() + 5 * 60 * 1000),
        markedById: teacher.id,
        scheduledClassId: foreignLesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: foreignStudent.id,
      },
    }),
  ]);

  return {
    absentLessonTitle,
    foreignLessonId: foreignLesson.id,
    foreignLessonTitle,
    groupName,
    lateLessonId: lateLesson.id,
    lateLessonTitle,
    presentLessonTitle,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
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
