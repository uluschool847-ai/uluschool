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

const USER_EMAIL_PREFIX = "qa.teacher-assignments.";
const LESSON_PREFIX = "QA Teacher Assignments Lesson";
const GROUP_PREFIX = "QA Teacher Assignments Group";
const ASSIGNMENT_PREFIX = "QA Teacher Assignments Homework";
const SUBJECT_SLUG_PREFIX = "qa-teacher-assignments-subject";
const LEVEL_SLUG_PREFIX = "qa-teacher-assignments-level";

type TeacherAssignmentsFixture = {
  activeAssignmentTitle: string;
  archivedAssignmentTitle: string;
  createdAssignmentTitle: string;
  editedAssignmentTitle: string;
  foreignAssignmentId: string;
  foreignAssignmentTitle: string;
  groupId: string;
  groupName: string;
  subjectName: string;
  teacherAEmail: string;
  teacherAId: string;
  teacherAName: string;
};

let fixture: TeacherAssignmentsFixture;

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

async function setPortalSession(page: Page) {
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
        email: fixture.teacherAEmail,
        fullName: fixture.teacherAName,
        role: UserRole.TEACHER,
        uid: fixture.teacherAId,
      }),
    },
  ]);
}

test.describe("Teacher homework assignments portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("teacher can filter, create, edit, archive, and cannot open another teacher assignment", async ({
    page,
  }) => {
    await setPortalSession(page);
    await page.goto(`${BASE_URL}/portal/teacher/assignments`);

    await expect(page.getByRole("heading", { name: /homework assignments/i })).toBeVisible();
    await expect(page.getByText(fixture.activeAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);

    await expect(page.getByLabel(/status/i)).toBeVisible();
    await expect(page.getByLabel(/^class group$/i)).toBeVisible();
    await expect(page.getByLabel(/subject/i)).toBeVisible();
    await expect(page.getByLabel(/search/i)).toBeVisible();
    await expect(page.getByLabel(/^due date from$/i)).toBeVisible();
    await expect(page.getByLabel(/^due date to$/i)).toBeVisible();
    await expect(page.getByLabel(/sort/i)).toBeVisible();
    await expect(page.getByText(/graded:\s*\d+/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /^view$/i })).toHaveCount(0);
    await expect(page.getByText(/\bdelete\b/i)).toHaveCount(0);

    await Promise.all([
      page.waitForURL(/\/portal\/teacher\/assignments\/new/),
      page.getByRole("link", { name: /create homework/i }).click(),
    ]);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /create homework/i })).toBeEnabled();
    await page.getByLabel(/title/i).fill(fixture.createdAssignmentTitle);
    await page.getByLabel(/description/i).fill("Created from E2E flow.");
    await page.getByLabel(/class \/ group/i).selectOption(fixture.groupId);
    await page.getByLabel(/subject/i).selectOption({ label: fixture.subjectName });
    await page.getByLabel(/due date/i).fill("2026-07-15");

    await Promise.all([
      page.waitForURL((url) => url.pathname === "/portal/teacher/assignments"),
      page.getByRole("button", { name: /create homework/i }).click(),
    ]);
    await expect(page.getByText(fixture.createdAssignmentTitle)).toBeVisible();

    await page
      .locator("article")
      .filter({ hasText: fixture.createdAssignmentTitle })
      .getByRole("link", { name: /edit/i })
      .click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/title/i).fill(fixture.editedAssignmentTitle);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/portal/teacher/assignments/") &&
          response.url().includes("/edit") &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: /save changes/i }).click(),
    ]);
    await page.goto(`${BASE_URL}/portal/teacher/assignments`);
    await expect(page.getByText(fixture.editedAssignmentTitle)).toBeVisible();

    const editedCard = page.locator("article").filter({ hasText: fixture.editedAssignmentTitle });
    await editedCard.getByRole("button", { name: /^archive$/i }).click();
    await editedCard.getByRole("button", { name: /confirm archive/i }).click();
    await expect(page.getByText(fixture.editedAssignmentTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/teacher/assignments?status=archived`);
    await expect(page.getByText(fixture.archivedAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.editedAssignmentTitle)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher/assignments/${fixture.foreignAssignmentId}/edit`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|denied/i).first(),
    ).toBeVisible();
  });
});

async function createFixtures(): Promise<TeacherAssignmentsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const futureStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const activeAssignmentTitle = `${ASSIGNMENT_PREFIX} Active ${suffix}`;
  const archivedAssignmentTitle = `${ASSIGNMENT_PREFIX} Archived ${suffix}`;
  const createdAssignmentTitle = `${ASSIGNMENT_PREFIX} Created ${suffix}`;
  const editedAssignmentTitle = `${ASSIGNMENT_PREFIX} Edited ${suffix}`;
  const foreignAssignmentTitle = `${ASSIGNMENT_PREFIX} Foreign ${suffix}`;
  const teacherAName = `QA Teacher Assignments A ${suffix}`;
  const teacherBName = `QA Teacher Assignments B ${suffix}`;
  const studentName = `QA Teacher Assignments Student ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const foreignGroupName = `${GROUP_PREFIX} B ${suffix}`;
  const subjectName = `QA Teacher Assignments Mathematics ${suffix}`;

  const [teacherA, teacherB, student, subject, level] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}teacher-a.${suffix}@example.com`,
        fullName: teacherAName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.TEACHER,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}teacher-b.${suffix}@example.com`,
        fullName: teacherBName,
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
    prisma.subject.create({
      data: {
        description: "Teacher assignments E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Teacher assignments E2E level",
        name: `QA Teacher Assignments Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  const [groupA, groupB] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: groupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: student.id }] },
        subjectId: subject.id,
        teacherId: teacherA.id,
      },
    }),
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: foreignGroupName,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacherB.id,
      },
    }),
  ]);

  const [lessonA, lessonB] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: groupA.id,
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: student.id }] },
        subjectId: subject.id,
        teacherId: teacherA.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} A ${suffix}`,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: groupB.id,
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        subjectId: subject.id,
        teacherId: teacherB.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} B ${suffix}`,
      },
    }),
  ]);

  const [foreignAssignment] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Foreign teacher assignment",
        dueDate: new Date(futureStart.getTime() + 5 * 24 * 60 * 60 * 1000),
        scheduledClassId: lessonB.id,
        subjectId: subject.id,
        teacherId: teacherB.id,
        title: foreignAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Active teacher assignment",
        dueDate: new Date(futureStart.getTime() + 4 * 24 * 60 * 60 * 1000),
        scheduledClassId: lessonA.id,
        subjectId: subject.id,
        teacherId: teacherA.id,
        title: activeAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        archivedAt: new Date(),
        description: "Archived teacher assignment",
        dueDate: new Date(futureStart.getTime() + 3 * 24 * 60 * 60 * 1000),
        scheduledClassId: lessonA.id,
        subjectId: subject.id,
        teacherId: teacherA.id,
        title: archivedAssignmentTitle,
      },
    }),
  ]);

  return {
    activeAssignmentTitle,
    archivedAssignmentTitle,
    createdAssignmentTitle,
    editedAssignmentTitle,
    foreignAssignmentId: foreignAssignment.id,
    foreignAssignmentTitle,
    groupId: groupA.id,
    groupName,
    subjectName,
    teacherAEmail: teacherA.email,
    teacherAId: teacherA.id,
    teacherAName,
  };
}

async function cleanupFixtures() {
  await prisma.submission.deleteMany({
    where: { assignment: { title: { contains: ASSIGNMENT_PREFIX } } },
  });
  await prisma.assignment.deleteMany({ where: { title: { contains: ASSIGNMENT_PREFIX } } });
  await prisma.scheduledClass.deleteMany({ where: { title: { contains: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { contains: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
