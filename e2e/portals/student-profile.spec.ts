import { type Page, expect, test } from "@playwright/test";
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

const USER_EMAIL_PREFIX = "qa.student-profile.";
const GROUP_PREFIX = "QA Student Profile Group";
const LESSON_PREFIX = "QA Student Profile Lesson";
const SUBJECT_SLUG_PREFIX = "qa-student-profile-subject";
const LEVEL_SLUG_PREFIX = "qa-student-profile-level";

type StudentProfileFixture = {
  classGroupName: string;
  directLessonTitle: string;
  foreignStudentName: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
};

let fixture: StudentProfileFixture;

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

test.describe("Student profile portal", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student opens profile from dashboard and only sees their own account context", async ({
    page,
  }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student`);

    const profileLink = page.getByRole("link", { name: /^open profile$/i });
    await expect(profileLink).toBeVisible({ timeout: 5000 });
    await Promise.all([page.waitForURL(/\/portal\/student\/profile/), profileLink.click()]);

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^profile$/i })).toBeVisible();
    await expect(main.getByText(fixture.studentName)).toBeVisible();
    await expect(main.getByText(fixture.studentEmail)).toBeVisible();
    await expect(main.getByText(fixture.classGroupName)).toBeVisible();
    await expect(main.getByText(fixture.directLessonTitle)).toBeVisible();
    await expect(main.getByText(fixture.foreignStudentName)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/student/profile?studentId=foreign-student`);
    const spoofedMain = page.getByRole("main");
    await expect(spoofedMain.getByText(fixture.studentName)).toBeVisible();
    await expect(spoofedMain.getByText(fixture.foreignStudentName)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<StudentProfileFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentName = `QA Student Profile Student ${suffix}`;
  const foreignStudentName = `QA Student Profile Foreign Student ${suffix}`;
  const teacherName = `QA Student Profile Teacher ${suffix}`;
  const classGroupName = `${GROUP_PREFIX} A ${suffix}`;
  const directLessonTitle = `${LESSON_PREFIX} Direct ${suffix}`;

  const [teacher, student, , subject, level] = await Promise.all([
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
        description: "Student profile E2E subject",
        isActive: true,
        name: `QA Student Profile Mathematics ${suffix}`,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student profile E2E level",
        name: `QA Student Profile Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  await prisma.classGroup.create({
    data: {
      capacity: 12,
      levelId: level.id,
      name: classGroupName,
      status: ClassGroupStatus.ACTIVE,
      students: { connect: [{ id: student.id }] },
      subjectId: subject.id,
      teacherId: teacher.id,
    },
  });

  await prisma.scheduledClass.create({
    data: {
      endAt: new Date("2026-06-01T11:00:00.000Z"),
      startAt: new Date("2026-06-01T10:00:00.000Z"),
      status: LessonStatus.SCHEDULED,
      students: { connect: [{ id: student.id }] },
      subjectId: subject.id,
      teacherId: teacher.id,
      title: directLessonTitle,
    },
  });

  return {
    classGroupName,
    directLessonTitle,
    foreignStudentName,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
  };
}

async function cleanupFixtures() {
  await prisma.scheduledClass.deleteMany({ where: { title: { startsWith: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
