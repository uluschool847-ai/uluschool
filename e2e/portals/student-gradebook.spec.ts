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

const USER_EMAIL_PREFIX = "qa.student-gradebook.";
const ASSIGNMENT_PREFIX = "QA Student Gradebook Assignment";
const GROUP_PREFIX = "QA Student Gradebook Group";
const LEVEL_SLUG_PREFIX = "qa-student-gradebook-level";
const LESSON_PREFIX = "QA Student Gradebook Lesson";
const MANUAL_PREFIX = "QA Student Gradebook Manual";
const SUBJECT_SLUG_PREFIX = "qa-student-gradebook-subject";
const TERM_PREFIX = "QA Student Gradebook Term";

type StudentGradebookFixture = {
  archivedManualTitle: string;
  foreignAssignmentTitle: string;
  foreignManualTitle: string;
  homeworkFeedback: string;
  homeworkTitle: string;
  manualDescription: string;
  manualTitle: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  termId: string;
  termName: string;
};

let fixture: StudentGradebookFixture;

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

function gradeRow(page: Page, title: string) {
  return page.locator("article, li, tr").filter({ hasText: title }).first();
}

test.describe("Student gradebook portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student can review only their own weighted gradebook rows and dashboard summary", async ({
    page,
  }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student/gradebook?termId=${fixture.termId}`);

    await expect(page.getByRole("heading", { name: /^gradebook$/i })).toBeVisible();
    await expect(page.getByText(fixture.termName)).toBeVisible();
    await expect(page.getByText(/term average:\s*84\.7/i)).toBeVisible();
    await expect(page.getByRole("region", { name: /homework/i })).toContainText(/weight:\s*70%/i);
    await expect(page.getByRole("region", { name: /manual/i })).toContainText(/weight:\s*30%/i);

    const homeworkRow = gradeRow(page, fixture.homeworkTitle);
    await expect(homeworkRow).toContainText(/82/);
    await expect(homeworkRow).toContainText(fixture.subjectName);
    await expect(homeworkRow).toContainText(fixture.homeworkFeedback);

    const manualRow = gradeRow(page, fixture.manualTitle);
    await expect(manualRow).toContainText(/91/);
    await expect(manualRow).toContainText(fixture.subjectName);
    await expect(manualRow).toContainText(fixture.manualDescription);

    await expect(page.getByText(fixture.archivedManualTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignManualTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/student`);
    const gradebookCard = page
      .getByRole("heading", { name: /^gradebook$/i })
      .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
    await expect(gradebookCard.getByRole("link", { name: /^open gradebook$/i })).toHaveAttribute(
      "href",
      "/portal/student/gradebook",
    );
    await expect(gradebookCard).toContainText(/grade average:\s*84\.7/i);
  });
});

async function createFixtures(): Promise<StudentGradebookFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const studentName = `QA Student Gradebook Student ${suffix}`;
  const foreignStudentName = `QA Student Gradebook Foreign Student ${suffix}`;
  const teacherName = `QA Student Gradebook Teacher ${suffix}`;
  const subjectName = `QA Student Gradebook Mathematics ${suffix}`;
  const termName = `${TERM_PREFIX} Spring ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const homeworkTitle = `${ASSIGNMENT_PREFIX} Quadratics ${suffix}`;
  const foreignAssignmentTitle = `${ASSIGNMENT_PREFIX} Foreign ${suffix}`;
  const manualTitle = `${MANUAL_PREFIX} Oral checkpoint ${suffix}`;
  const archivedManualTitle = `${MANUAL_PREFIX} Archived draft ${suffix}`;
  const foreignManualTitle = `${MANUAL_PREFIX} Foreign ${suffix}`;
  const homeworkFeedback = `Strong quadratic reasoning ${suffix}`;
  const manualDescription = `Confident oral explanation ${suffix}`;

  const [teacher, student, foreignStudent, subject, level, term] = await Promise.all([
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
        description: "Student gradebook E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student gradebook E2E level",
        name: `QA Student Gradebook Level ${suffix}`,
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

  const [lesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: new Date("2026-03-09T11:00:00.000Z"),
        startAt: new Date("2026-03-09T10:00:00.000Z"),
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} ${suffix}`,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: foreignGroup.id,
        endAt: new Date("2026-03-09T11:00:00.000Z"),
        startAt: new Date("2026-03-09T10:00:00.000Z"),
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} Foreign ${suffix}`,
      },
    }),
  ]);

  const [assignment, foreignAssignment] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Gradebook homework fixture",
        dueDate: new Date("2026-03-09T12:00:00.000Z"),
        scheduledClassId: lesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: homeworkTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Foreign gradebook homework fixture",
        dueDate: new Date("2026-03-09T12:00:00.000Z"),
        scheduledClassId: foreignLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: foreignAssignmentTitle,
      },
    }),
  ]);

  await Promise.all([
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: "/uploads/student-gradebook-homework.pdf",
        feedback: homeworkFeedback,
        grade: 82,
        studentId: student.id,
        submittedAt: new Date("2026-03-10T10:00:00.000Z"),
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: foreignAssignment.id,
        contentUrl: "/uploads/student-gradebook-foreign.pdf",
        feedback: "Foreign feedback should stay hidden",
        grade: 100,
        studentId: foreignStudent.id,
        submittedAt: new Date("2026-03-10T10:00:00.000Z"),
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        classGroupId: group.id,
        description: manualDescription,
        gradedAt: new Date("2026-03-12T10:00:00.000Z"),
        score: 91,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: manualTitle,
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        archivedAt: new Date("2026-03-14T10:00:00.000Z"),
        classGroupId: group.id,
        description: "Archived draft should stay out of active view",
        gradedAt: new Date("2026-03-08T10:00:00.000Z"),
        score: 50,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: archivedManualTitle,
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        classGroupId: foreignGroup.id,
        description: "Foreign manual grade should stay hidden",
        gradedAt: new Date("2026-03-12T10:00:00.000Z"),
        score: 100,
        studentId: foreignStudent.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: foreignManualTitle,
      },
    }),
  ]);

  return {
    archivedManualTitle,
    foreignAssignmentTitle,
    foreignManualTitle,
    homeworkFeedback,
    homeworkTitle,
    manualDescription,
    manualTitle,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    subjectName,
    termId: term.id,
    termName,
  };
}

async function cleanupFixtures() {
  await prisma.manualGradeEntry.deleteMany({ where: { title: { startsWith: MANUAL_PREFIX } } });
  await prisma.submission.deleteMany({
    where: { assignment: { title: { startsWith: ASSIGNMENT_PREFIX } } },
  });
  await prisma.assignment.deleteMany({ where: { title: { startsWith: ASSIGNMENT_PREFIX } } });
  await prisma.scheduledClass.deleteMany({ where: { title: { startsWith: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: GROUP_PREFIX } } });
  await prisma.academicTerm.deleteMany({ where: { name: { startsWith: TERM_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
