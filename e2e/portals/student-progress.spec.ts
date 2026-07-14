import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import { PerformanceLevel, PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.student-progress.";
const SUBJECT_SLUG_PREFIX = "qa-student-progress-subject";
const NOTE_PREFIX = "QA Student Progress Note";

type StudentProgressFixture = {
  activeNoteContent: string;
  archivedNoteContent: string;
  foreignNoteContent: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  subjectName: string;
};

let fixture: StudentProgressFixture;

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

function progressCard(page: Page, noteText: string) {
  return page.locator("article").filter({ hasText: noteText }).first();
}

test.describe("Student progress portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student can review, filter, and search only their own progress history", async ({
    page,
  }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student/progress`);

    await expect(page.getByRole("heading", { name: /^progress$/i })).toBeVisible();
    await expect(page.getByText(fixture.activeNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.archivedNoteContent)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignNoteContent)).toHaveCount(0);
    await expect(progressCard(page, fixture.activeNoteContent).getByText(/good/i)).toBeVisible();
    await expect(
      progressCard(page, fixture.activeNoteContent).getByText(fixture.subjectName),
    ).toBeVisible();

    await page.locator('select[name="performanceLevel"]').selectOption(PerformanceLevel.GOOD);
    await page.getByRole("button", { name: /apply|filter|show progress/i }).click();
    await expect(page.getByText(fixture.activeNoteContent)).toBeVisible();

    await page.getByLabel(/search/i).fill(fixture.subjectName);
    await page.getByRole("button", { name: /apply|filter|show progress/i }).click();
    await expect(page.getByText(fixture.activeNoteContent)).toBeVisible();

    await page.locator('select[name="status"]').selectOption("archived");
    await page.getByLabel(/search/i).fill("");
    await page.getByRole("button", { name: /apply|filter|show progress/i }).click();
    await expect(page.getByText(fixture.archivedNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.activeNoteContent)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignNoteContent)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/student`);
    await page.getByRole("link", { name: /progress/i }).click();
    await expect(page).toHaveURL(/\/portal\/student\/progress$/);
  });
});

async function createFixtures(): Promise<StudentProgressFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentName = `QA Student Progress Student ${suffix}`;
  const foreignStudentName = `QA Student Progress Foreign Student ${suffix}`;
  const teacherName = `QA Student Progress Teacher ${suffix}`;
  const subjectName = `QA Student Progress Mathematics ${suffix}`;
  const activeNoteContent = `${NOTE_PREFIX} Active algebra growth ${suffix}`;
  const archivedNoteContent = `${NOTE_PREFIX} Archived geometry growth ${suffix}`;
  const foreignNoteContent = `${NOTE_PREFIX} Foreign hidden note ${suffix}`;

  const [teacher, student, foreignStudent, subject] = await Promise.all([
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
        description: "Student progress E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  await Promise.all([
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.GOOD,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: activeNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        archivedAt: new Date(),
        gradeLevel: PerformanceLevel.STRUGGLING,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: archivedNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.EXCELLENT,
        studentId: foreignStudent.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: foreignNoteContent,
      },
    }),
  ]);

  return {
    activeNoteContent,
    archivedNoteContent,
    foreignNoteContent,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    subjectName,
  };
}

async function cleanupFixtures() {
  await prisma.studentProgress.deleteMany({
    where: { teacherNotes: { contains: NOTE_PREFIX } },
  });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
