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

const USER_EMAIL_PREFIX = "qa.teacher-submissions.";
const LESSON_PREFIX = "QA Teacher Submissions Lesson";
const GROUP_PREFIX = "QA Teacher Submissions Group";
const ASSIGNMENT_PREFIX = "QA Teacher Submissions Homework";
const SUBJECT_SLUG_PREFIX = "qa-teacher-submissions-subject";

type TeacherSubmissionsFixture = {
  assignmentTitle: string;
  classGroupId: string;
  classGroupName: string;
  foreignSubmissionId: string;
  foreignSubmissionStudent: string;
  lessonId: string;
  submissionId: string;
  studentName: string;
  subjectName: string;
  teacherAEmail: string;
  teacherAId: string;
  teacherAName: string;
};

let fixture: TeacherSubmissionsFixture;

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

test.describe("Teacher submissions portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("teacher can list, filter, grade, search, and navigate to scoped submissions", async ({
    page,
  }) => {
    await setPortalSession(page);
    await page.goto(`${BASE_URL}/portal/teacher/submissions`);

    await expect(page.getByRole("heading", { name: /submissions/i })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.assignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignSubmissionStudent)).toHaveCount(0);

    await page.getByLabel(/status/i).selectOption("pending");
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page).toHaveURL(/status=pending/);
    await expect(page.getByText(/pending/i).first()).toBeVisible();

    const pendingRow = page.locator("article, tr").filter({ hasText: fixture.studentName }).first();
    await pendingRow.getByRole("link", { name: /^review$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/teacher/submissions/${fixture.submissionId}`));
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.assignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.classGroupName)).toBeVisible();
    await expect(page.getByText(fixture.subjectName)).toBeVisible();
    await expect(page.getByRole("link", { name: /open submitted work/i })).toHaveAttribute(
      "href",
      /\/uploads\/submissions\/teacher-submissions-a\.pdf$/,
    );

    await page.getByLabel(/score 0-100|score/i).fill("92");
    await page.getByLabel(/feedback/i).fill("Strong solution.");
    await page.getByRole("button", { name: /save grade/i }).click();
    await expect
      .poll(async () => {
        const submission = await prisma.submission.findUnique({
          select: { grade: true },
          where: { id: fixture.submissionId },
        });
        return submission?.grade;
      })
      .toBe(92);
    await expect(page.getByText(/grade saved|success/i)).toBeVisible();
    await expect(page.getByText(/graded/i).first()).toBeVisible();
    await expect(page.getByText(/current grade:\s*92/i)).toBeVisible();

    await page.getByRole("link", { name: /back to submissions/i }).click();
    await expect(page).toHaveURL(/\/portal\/teacher\/submissions/);

    await page.goto(`${BASE_URL}/portal/teacher/submissions?status=graded`);
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(/graded/i).first()).toBeVisible();

    const gradedRow = page.locator("article, tr").filter({ hasText: fixture.studentName }).first();
    await gradedRow.getByRole("link", { name: /^review$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/teacher/submissions/${fixture.submissionId}`));
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /update grade/i })).toBeEnabled();
    await page.getByLabel(/score 0-100|score/i).fill("101");
    await page.getByRole("button", { name: /update grade/i }).click();
    await expect(page.getByText(/grade must be less than or equal to 100/i)).toBeVisible();

    await page.getByLabel(/score 0-100|score/i).fill("84");
    await page.getByLabel(/feedback/i).fill("Updated after review.");
    await page.getByRole("button", { name: /update grade/i }).click();
    await expect
      .poll(async () => {
        const submission = await prisma.submission.findUnique({
          select: { feedback: true, grade: true },
          where: { id: fixture.submissionId },
        });
        return `${submission?.grade}:${submission?.feedback}`;
      })
      .toBe("84:Updated after review.");
    await expect(page.getByText(/grade saved|success/i)).toBeVisible();
    await expect(page.getByText(/current grade:\s*84/i)).toBeVisible();
    await expect(page.getByText(/current feedback:\s*updated after review\./i)).toBeVisible();

    await page.getByLabel(/feedback/i).fill("");
    await page.getByRole("button", { name: /update grade/i }).click();
    await expect
      .poll(async () => {
        const submission = await prisma.submission.findUnique({
          select: { feedback: true },
          where: { id: fixture.submissionId },
        });
        return submission?.feedback ?? null;
      })
      .toBeNull();
    await expect(page.getByText(/no feedback/i)).toBeVisible();

    await page.getByLabel(/feedback/i).fill("x".repeat(2001));
    await page.getByRole("button", { name: /update grade/i }).click();
    await expect(page.getByText(/feedback.*2000/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher/submissions?status=graded`);
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(/graded/i).first()).toBeVisible();

    await page.getByLabel(/search/i).fill(fixture.assignmentTitle);
    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page).toHaveURL(/search=/);
    await expect(page.getByText(fixture.assignmentTitle)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher`);
    await expect(page.getByRole("link", { exact: true, name: "Submissions" })).toHaveAttribute(
      "href",
      "/portal/teacher/submissions",
    );

    await page.goto(`${BASE_URL}/portal/teacher/classes/${fixture.classGroupId}`);
    await expect(page.getByRole("link", { exact: true, name: "Submissions" })).toHaveAttribute(
      "href",
      `/portal/teacher/submissions?classGroupId=${fixture.classGroupId}`,
    );

    await page.goto(`${BASE_URL}/portal/teacher/lessons/${fixture.lessonId}`);
    await expect(page.getByText(/teacher submissions route is not implemented/i)).toHaveCount(0);
    await expect(
      page.getByRole("link", { exact: true, name: "Review Submissions" }),
    ).toHaveAttribute(
      "href",
      new RegExp(
        `/portal/teacher/submissions\\?(scheduledClassId=${fixture.lessonId}|assignmentId=)`,
      ),
    );

    await page.goto(`${BASE_URL}/portal/teacher/submissions/${fixture.foreignSubmissionId}`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|denied/i).first(),
    ).toBeVisible();
  });
});

async function createFixtures(): Promise<TeacherSubmissionsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const teacherAName = `QA Teacher Submissions A ${suffix}`;
  const teacherBName = `QA Teacher Submissions B ${suffix}`;
  const studentName = `QA Teacher Submissions Student ${suffix}`;
  const foreignStudentName = `QA Teacher Submissions Foreign Student ${suffix}`;
  const subjectName = `QA Teacher Submissions Algebra ${suffix}`;
  const classGroupName = `${GROUP_PREFIX} A ${suffix}`;
  const assignmentTitle = `${ASSIGNMENT_PREFIX} Pending ${suffix}`;

  const [teacherA, teacherB, student, foreignStudent, subject] = await Promise.all([
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
        description: "Teacher submissions E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  const [groupA, groupB] = await Promise.all([
    prisma.classGroup.create({
      data: {
        name: classGroupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: student.id }] },
        subjectId: subject.id,
        teacherId: teacherA.id,
      },
    }),
    prisma.classGroup.create({
      data: {
        name: `${GROUP_PREFIX} B ${suffix}`,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: foreignStudent.id }] },
        subjectId: subject.id,
        teacherId: teacherB.id,
      },
    }),
  ]);

  const [lessonA, lessonB] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: groupA.id,
        endAt,
        startAt,
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
        endAt,
        startAt,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: foreignStudent.id }] },
        subjectId: subject.id,
        teacherId: teacherB.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} B ${suffix}`,
      },
    }),
  ]);

  const [assignmentA, assignmentB] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Teacher-owned assignment",
        dueDate: new Date(startAt.getTime() + 3 * 24 * 60 * 60 * 1000),
        scheduledClassId: lessonA.id,
        subjectId: subject.id,
        teacherId: teacherA.id,
        title: assignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Foreign teacher assignment",
        dueDate: new Date(startAt.getTime() + 3 * 24 * 60 * 60 * 1000),
        scheduledClassId: lessonB.id,
        subjectId: subject.id,
        teacherId: teacherB.id,
        title: `${ASSIGNMENT_PREFIX} Foreign ${suffix}`,
      },
    }),
  ]);

  const [submissionA, foreignSubmission] = await Promise.all([
    prisma.submission.create({
      data: {
        assignmentId: assignmentA.id,
        contentUrl: "/uploads/submissions/teacher-submissions-a.pdf",
        studentId: student.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: assignmentB.id,
        contentUrl: "/uploads/submissions/teacher-submissions-foreign.pdf",
        studentId: foreignStudent.id,
      },
    }),
  ]);

  return {
    assignmentTitle,
    classGroupId: groupA.id,
    classGroupName,
    foreignSubmissionId: foreignSubmission.id,
    foreignSubmissionStudent: foreignStudentName,
    lessonId: lessonA.id,
    submissionId: submissionA.id,
    studentName,
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
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
