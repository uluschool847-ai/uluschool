import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import { ClassGroupStatus, PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.student-reports.";
const GROUP_PREFIX = "QA Student Reports Group";
const LEVEL_SLUG_PREFIX = "qa-student-reports-level";
const SUBJECT_SLUG_PREFIX = "qa-student-reports-subject";
const TERM_PREFIX = "QA Student Reports Term";

type StudentReportsFixture = {
  attendanceLessonTitle: string;
  foreignSnapshotId: string;
  foreignTermName: string;
  homeworkTitle: string;
  manualTitle: string;
  progressContent: string;
  snapshotId: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  teacherComment: string;
  termName: string;
};

let fixture: StudentReportsFixture;

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

test.describe("Student reports portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student can list and open only their own immutable report snapshot", async ({ page }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student/reports`);

    await expect(page.getByRole("heading", { name: /^reports$/i })).toBeVisible();
    await expect(page.getByText(fixture.termName)).toBeVisible();
    await expect(page.getByText(fixture.teacherComment)).toBeVisible();
    await expect(page.getByText(/weighted term average:\s*92/i)).toBeVisible();
    await expect(page.getByText(fixture.foreignTermName)).toHaveCount(0);

    await page.getByLabel(/search/i).fill(fixture.termName);
    await page.getByRole("button", { name: /apply|filter|show reports/i }).click();
    await expect(page.getByText(fixture.termName)).toBeVisible();

    await Promise.all([
      page.waitForURL(new RegExp(`/portal/student/reports/${fixture.snapshotId}$`)),
      page.getByRole("link", { name: /view report/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /^report$/i })).toBeVisible();
    await expect(page.locator("#main-content").getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.termName)).toBeVisible();
    await expect(page.getByText(fixture.homeworkTitle)).toBeVisible();
    await expect(page.getByText(fixture.manualTitle)).toBeVisible();
    await expect(page.getByText(/present:\s*8/i)).toBeVisible();
    await expect(page.getByText(fixture.attendanceLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.progressContent)).toBeVisible();
    await expect(page.getByText(fixture.teacherComment)).toBeVisible();
    await expect(
      page
        .getByRole("link", { name: /download pdf|open pdf/i })
        .or(page.getByText(/pdf is not available yet/i)),
    ).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student`);
    await expect(page.getByRole("link", { name: /reports/i })).toHaveAttribute(
      "href",
      "/portal/student/reports",
    );
    await expect(page.getByText(/latest report/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/reports/${fixture.foreignSnapshotId}`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|not available/i).first(),
    ).toBeVisible();
    await expect(page.getByText(fixture.foreignTermName)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<StudentReportsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentName = `QA Student Reports Student ${suffix}`;
  const foreignStudentName = `QA Student Reports Foreign Student ${suffix}`;
  const teacherName = `QA Student Reports Teacher ${suffix}`;
  const subjectName = `QA Student Reports Mathematics ${suffix}`;
  const termName = `${TERM_PREFIX} Spring ${suffix}`;
  const foreignTermName = `${TERM_PREFIX} Foreign ${suffix}`;
  const teacherComment = `Keep practicing transformations ${suffix}`;
  const homeworkTitle = `QA Student Reports Homework ${suffix}`;
  const manualTitle = `QA Student Reports Manual ${suffix}`;
  const attendanceLessonTitle = `QA Student Reports Attendance Lesson ${suffix}`;
  const progressContent = `QA Student Reports Progress note ${suffix}`;

  const [teacher, student, foreignStudent, subject, level, term, foreignTerm] = await Promise.all([
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
        description: "Student reports E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student reports E2E level",
        name: `QA Student Reports Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.academicTerm.create({
      data: {
        endDate: new Date("2026-06-30T23:59:59.999Z"),
        isActive: true,
        name: termName,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    }),
    prisma.academicTerm.create({
      data: {
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        isActive: false,
        name: foreignTermName,
        startDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    }),
  ]);

  const [group, foreignGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: `${GROUP_PREFIX} A ${suffix}`,
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

  const snapshotData = {
    academicTerm: { id: term.id, name: termName },
    attendance: { absent: 1, late: 1, present: 8 },
    attendanceHistory: [{ lessonTitle: attendanceLessonTitle, status: "PRESENT" }],
    classGroup: { id: group.id, name: group.name },
    grades: {
      categories: [{ label: "Homework", average: 92 }],
      homeworkGrades: [{ score: 92, subject: { name: subjectName }, title: homeworkTitle }],
      manualGrades: [
        {
          description: "Confident oral explanation",
          score: 88,
          subject: { name: subjectName },
          title: manualTitle,
        },
      ],
      weightedTermAverage: 92,
    },
    progressNotes: [{ content: progressContent, performanceLevel: "GOOD" }],
    student: { fullName: studentName, id: student.id },
    teacherComment,
  };

  const [snapshot, foreignSnapshot] = await Promise.all([
    prisma.reportSnapshot.create({
      data: {
        academicTermId: term.id,
        classGroupId: group.id,
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        generatedByTeacherId: teacher.id,
        snapshotData,
        snapshotVersion: 1,
        studentId: student.id,
        teacherComment,
      },
    }),
    prisma.reportSnapshot.create({
      data: {
        academicTermId: foreignTerm.id,
        classGroupId: foreignGroup.id,
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        generatedByTeacherId: teacher.id,
        snapshotData: {
          ...snapshotData,
          academicTerm: { id: foreignTerm.id, name: foreignTermName },
          classGroup: { id: foreignGroup.id, name: foreignGroup.name },
          student: { fullName: foreignStudentName, id: foreignStudent.id },
        },
        snapshotVersion: 1,
        studentId: foreignStudent.id,
        teacherComment: "Foreign report hidden",
      },
    }),
  ]);

  return {
    attendanceLessonTitle,
    foreignSnapshotId: foreignSnapshot.id,
    foreignTermName,
    homeworkTitle,
    manualTitle,
    progressContent,
    snapshotId: snapshot.id,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    teacherComment,
    termName,
  };
}

async function cleanupFixtures() {
  await prisma.reportSnapshot.deleteMany({
    where: {
      OR: [
        { teacherComment: { contains: "transformations" } },
        { academicTerm: { name: { startsWith: TERM_PREFIX } } },
      ],
    },
  });
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: GROUP_PREFIX } } });
  await prisma.academicTerm.deleteMany({ where: { name: { startsWith: TERM_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
