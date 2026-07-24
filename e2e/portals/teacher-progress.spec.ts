import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import {
  ClassGroupStatus,
  LessonStatus,
  PrismaClient,
  StudentLearningStatus,
  UserRole,
} from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.teacher-progress.";
const GROUP_PREFIX = "QA Teacher Progress Group";
const LESSON_PREFIX = "QA Teacher Progress Lesson";
const SUBJECT_SLUG_PREFIX = "qa-teacher-progress-subject";

type TeacherProgressFixture = {
  archivedNoteContent: string;
  classGroupName: string;
  foreignStudentId: string;
  initialNoteContent: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  teacherEmail: string;
  teacherId: string;
  teacherName: string;
};

let fixture: TeacherProgressFixture;

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
        email: fixture.teacherEmail,
        fullName: fixture.teacherName,
        role: UserRole.TEACHER,
        uid: fixture.teacherId,
      }),
    },
  ]);
}

test.describe("Teacher progress portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("teacher can manage progress notes only for assigned students", async ({ page }) => {
    await setPortalSession(page);

    await page.goto(`${BASE_URL}/portal/teacher/progress`);
    await expect(page.getByRole("heading", { exact: true, name: "Progress" })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.initialNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.archivedNoteContent)).toHaveCount(0);

    await page.getByLabel(/status/i).selectOption("archived");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page).toHaveURL(/status=archived/);
    await expect(page.getByText(fixture.archivedNoteContent)).toBeVisible();

    await page.getByLabel(/status/i).selectOption("all");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page.getByText(fixture.initialNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.archivedNoteContent)).toBeVisible();

    await page.getByLabel(/performance/i).selectOption("GOOD");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page).toHaveURL(/performanceLevel=GOOD/);
    await expect(page.getByText(fixture.initialNoteContent)).toBeVisible();

    await page.getByLabel(/search/i).fill(fixture.studentName);
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await page
      .getByRole("link", { name: /open progress|view progress/i })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/portal/teacher/students/${fixture.studentId}/progress`),
    );

    await page.goto(`${BASE_URL}/portal/teacher/students`);
    await expect(page.getByRole("heading", { name: /students/i })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.studentEmail)).toBeVisible();

    await page.getByRole("link", { name: new RegExp(fixture.studentName, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/teacher/students/${fixture.studentId}`));
    await expect(page.getByText(fixture.classGroupName)).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Progress" })).toHaveAttribute(
      "href",
      `/portal/teacher/students/${fixture.studentId}/progress`,
    );

    await page.getByRole("link", { exact: true, name: "Progress" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/portal/teacher/students/${fixture.studentId}/progress`),
    );
    await expect(
      page.getByRole("heading", { exact: true, name: "Student Progress" }),
    ).toBeVisible();

    await page.getByLabel(/subject/i).selectOption({ label: fixture.subjectName });
    await page.getByLabel(/progress note|content/i).fill("Great work with functions.");
    await page.getByLabel(/performance level/i).selectOption("GOOD");
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/portal/teacher/students/${fixture.studentId}/progress`) &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: /save|create/i }).click();
    await createResponse;
    await page.reload();
    await expect(page.getByText(/great work with functions/i)).toBeVisible();

    await page
      .getByRole("button", { name: /^edit$/i })
      .first()
      .click();
    await page.getByLabel(/progress note|content/i).fill("Excellent work with functions.");
    await page.getByLabel(/performance level/i).selectOption("EXCELLENT");
    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/portal/teacher/students/${fixture.studentId}/progress`) &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: /save changes|update/i }).click();
    await updateResponse;
    await page.reload();
    await expect(page.getByText(/excellent work with functions/i)).toBeVisible();
    await expect(page.getByText(/· EXCELLENT/i)).toBeVisible();

    await page
      .getByRole("button", { name: /^archive$/i })
      .first()
      .click();
    const archiveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/portal/teacher/students/${fixture.studentId}/progress`) &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: /confirm archive/i }).click();
    await archiveResponse;
    await page.reload();
    await expect(page.getByText(/excellent work with functions/i)).toHaveCount(0);

    await page.getByLabel(/status/i).selectOption("archived");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page).toHaveURL(/status=archived/);
    await expect(page.getByText(/excellent work with functions/i)).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: /excellent work with functions/i })
        .getByLabel(/archived/i),
    ).toBeVisible();

    await page.getByLabel(/status/i).selectOption("all");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page).toHaveURL(/status=all/);
    await expect(page.getByText(/excellent work with functions/i)).toBeVisible();

    await page.getByRole("link", { name: /all progress|back to progress/i }).click();
    await expect(page).toHaveURL(/\/portal\/teacher\/progress(?:\?|$)/);
    await page.getByLabel(/status/i).selectOption("archived");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page.getByText(/excellent work with functions/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher/students/${fixture.foreignStudentId}/progress`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|denied/i).first(),
    ).toBeVisible();
  });
});

async function createFixtures(): Promise<TeacherProgressFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const teacherName = `QA Teacher Progress A ${suffix}`;
  const teacherBName = `QA Teacher Progress B ${suffix}`;
  const studentName = `QA Teacher Progress Student ${suffix}`;
  const foreignStudentName = `QA Teacher Progress Foreign Student ${suffix}`;
  const subjectName = `QA Teacher Progress Algebra ${suffix}`;
  const classGroupName = `${GROUP_PREFIX} A ${suffix}`;
  const initialNoteContent = `Initial progress note ${suffix}`;
  const archivedNoteContent = `Archived progress note ${suffix}`;

  const [teacher, foreignTeacher, student, foreignStudent, subject] = await Promise.all([
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
        email: `${USER_EMAIL_PREFIX}foreign-teacher.${suffix}@example.com`,
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
        description: "Teacher progress E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  const [group, foreignGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        name: classGroupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: student.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
    prisma.classGroup.create({
      data: {
        name: `${GROUP_PREFIX} B ${suffix}`,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: foreignStudent.id }] },
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
      },
    }),
  ]);

  await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt,
        startAt,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: student.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} A ${suffix}`,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: foreignGroup.id,
        endAt,
        startAt,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: foreignStudent.id }] },
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} B ${suffix}`,
      },
    }),
  ]);

  await Promise.all([
    prisma.studentProgress.create({
      data: {
        gradeLevel: "GOOD",
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: initialNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        archivedAt: new Date(),
        gradeLevel: "STRUGGLING",
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: archivedNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: "EXCELLENT",
        studentId: foreignStudent.id,
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
        teacherNotes: `Foreign progress note ${suffix}`,
      },
    }),
  ]);

  return {
    archivedNoteContent,
    classGroupName,
    foreignStudentId: foreignStudent.id,
    initialNoteContent,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    subjectName,
    teacherEmail: teacher.email,
    teacherId: teacher.id,
    teacherName,
  };
}

async function cleanupFixtures() {
  await prisma.studentProgress.deleteMany({
    where: {
      OR: [
        { student: { email: { startsWith: USER_EMAIL_PREFIX } } },
        { teacher: { email: { startsWith: USER_EMAIL_PREFIX } } },
      ],
    },
  });
  await prisma.scheduledClass.deleteMany({ where: { title: { contains: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { contains: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
