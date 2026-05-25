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
const SUBMITTED_WORK_URL = `${BASE_URL}/e2e-assets/submitted-work`;
const GRADED_WORK_URL = `${BASE_URL}/e2e-assets/graded-work`;
const RESUBMITTED_WORK_URL = `${BASE_URL}/e2e-assets/resubmitted-work`;

const USER_EMAIL_PREFIX = "qa.student-assignments.";
const LESSON_PREFIX = "QA Student Assignments Lesson";
const GROUP_PREFIX = "QA Student Assignments Group";
const ASSIGNMENT_PREFIX = "QA Student Assignments Homework";
const SUBJECT_SLUG_PREFIX = "qa-student-assignments-subject";
const LEVEL_SLUG_PREFIX = "qa-student-assignments-level";

type StudentAssignmentsFixture = {
  activeAssignmentId: string;
  activeLessonTitle: string;
  activeAssignmentTitle: string;
  archivedAssignmentId: string;
  archivedAssignmentTitle: string;
  foreignAssignmentId: string;
  foreignAssignmentTitle: string;
  gradedAssignmentId: string;
  gradedAssignmentTitle: string;
  groupName: string;
  overdueAssignmentId: string;
  overdueAssignmentTitle: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  submittedAssignmentTitle: string;
};

let fixture: StudentAssignmentsFixture;

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

function assignmentCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

test.describe("Student assignments portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student can list, filter, submit, resubmit, review graded work, and cannot open foreign assignments", async ({
    page,
  }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student`);
    await expect(page.getByText(/1 overdue assignment/i)).toBeVisible();
    await expect(page.getByText(/this assignment is overdue/i)).toBeVisible();
    await expect(page.getByRole("link", { name: fixture.overdueAssignmentTitle })).toHaveAttribute(
      "href",
      `/portal/student/assignments/${fixture.overdueAssignmentId}`,
    );

    await page.goto(`${BASE_URL}/portal/student/assignments`);

    await expect(page.getByRole("heading", { name: /^assignments$/i })).toBeVisible();
    await expect(page.getByText(fixture.overdueAssignmentTitle)).toBeVisible();
    await expect(
      assignmentCard(page, fixture.overdueAssignmentTitle).getByText(/missing/i),
    ).toBeVisible();
    await expect(
      assignmentCard(page, fixture.overdueAssignmentTitle).getByText(/this assignment is overdue/i),
    ).toBeVisible();
    await expect(page.getByText(fixture.activeAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.submittedAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.gradedAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.archivedAssignmentTitle)).toHaveCount(0);

    await page.getByLabel(/status/i).selectOption("submitted");
    await page.getByRole("button", { name: /apply|filter|show assignments/i }).click();
    await expect(page.getByText(fixture.submittedAssignmentTitle)).toBeVisible();
    await expect(
      assignmentCard(page, fixture.submittedAssignmentTitle).getByText(fixture.groupName),
    ).toBeVisible();
    await expect(page.getByText(fixture.activeAssignmentTitle)).toHaveCount(0);

    await page.getByLabel(/search/i).fill("Graded");
    await page.getByLabel(/status/i).selectOption("graded");
    await page.getByRole("button", { name: /apply|filter|show assignments/i }).click();
    await expect(page.getByText(fixture.gradedAssignmentTitle)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/assignments`);
    await Promise.all([
      page.waitForURL(/\/portal\/student\/assignments\/[^/?]+$/),
      assignmentCard(page, fixture.overdueAssignmentTitle)
        .getByRole("link", { name: /view assignment|open assignment|details/i })
        .click(),
    ]);

    await expect(page.getByRole("heading", { name: fixture.overdueAssignmentTitle })).toBeVisible();
    await expect(page.getByText(/this assignment is overdue/i)).toBeVisible();
    await page.getByLabel(/work link|submission url|content/i).fill(SUBMITTED_WORK_URL);
    await page.getByRole("button", { name: /^submit$/i }).click();
    await expect(page.getByText(/submitted|saved|updated/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/assignments?status=missing`);
    await expect(page.getByText(fixture.overdueAssignmentTitle)).toHaveCount(0);
    await expect(page.getByText(/this assignment is overdue/i)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/student/assignments`);
    await Promise.all([
      page.waitForURL(/\/portal\/student\/assignments\/[^/?]+$/),
      assignmentCard(page, fixture.activeAssignmentTitle)
        .getByRole("link", { name: /view assignment|open assignment|details/i })
        .click(),
    ]);

    await expect(page.getByRole("heading", { name: fixture.activeAssignmentTitle })).toBeVisible();
    await expect(page.getByText(fixture.subjectName)).toBeVisible();
    await expect(page.getByText(fixture.activeLessonTitle)).toBeVisible();
    await expect(page.getByRole("link", { name: "Lesson context" })).toHaveAttribute(
      "href",
      /\/portal\/student\/schedule\/[^/]+$/,
    );
    await expect(page.getByText(/lesson notes/i)).toBeVisible();

    await page.getByLabel(/work link|submission url|content/i).fill(SUBMITTED_WORK_URL);
    await page.getByRole("button", { name: /^submit$/i }).click();
    await expect(page.getByText(/submitted|saved|updated/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /resubmit/i })).toBeVisible();

    await page.getByLabel(/work link|submission url|content/i).fill(RESUBMITTED_WORK_URL);
    await page.getByRole("button", { name: /resubmit/i }).click();
    await expect(page.getByText(/resubmitted|updated|saved/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/assignments/${fixture.gradedAssignmentId}`);
    await expect(page.getByRole("heading", { name: fixture.gradedAssignmentTitle })).toBeVisible();
    await expect(page.getByText(/94/)).toBeVisible();
    await expect(page.getByText(/excellent reasoning/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/student/assignments?status=archived`);
    await expect(page.getByText(fixture.archivedAssignmentTitle)).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/portal\/student\/assignments\/[^/?]+$/),
      assignmentCard(page, fixture.archivedAssignmentTitle)
        .getByRole("link", { name: /view assignment|open assignment|details/i })
        .click(),
    ]);
    await expect(page.getByText("This assignment is archived. Read-only.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^submit$|resubmit/i })).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/student/assignments/${fixture.foreignAssignmentId}`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|not available/i).first(),
    ).toBeVisible();
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<StudentAssignmentsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const studentName = `QA Student Assignments Student ${suffix}`;
  const foreignStudentName = `QA Student Assignments Foreign Student ${suffix}`;
  const teacherName = `QA Student Assignments Teacher ${suffix}`;
  const subjectName = `QA Student Assignments Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const directLessonTitle = `${LESSON_PREFIX} Direct ${suffix}`;
  const foreignGroupName = `${GROUP_PREFIX} Foreign ${suffix}`;
  const activeAssignmentTitle = `${ASSIGNMENT_PREFIX} Active ${suffix}`;
  const overdueAssignmentTitle = `${ASSIGNMENT_PREFIX} Overdue ${suffix}`;
  const submittedAssignmentTitle = `${ASSIGNMENT_PREFIX} Submitted ${suffix}`;
  const gradedAssignmentTitle = `${ASSIGNMENT_PREFIX} Graded ${suffix}`;
  const archivedAssignmentTitle = `${ASSIGNMENT_PREFIX} Archived ${suffix}`;
  const foreignAssignmentTitle = `${ASSIGNMENT_PREFIX} Foreign ${suffix}`;

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
        description: "Student assignments E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student assignments E2E level",
        name: `QA Student Assignments Level ${suffix}`,
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
        name: foreignGroupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: foreignStudent.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
  ]);

  const [directLesson, groupLesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: student.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Europe/Kiev",
        title: directLessonTitle,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Europe/Kiev",
        title: `${LESSON_PREFIX} Group ${suffix}`,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: foreignGroup.id,
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Europe/Kiev",
        title: `${LESSON_PREFIX} Foreign ${suffix}`,
      },
    }),
  ]);

  const [
    activeAssignment,
    overdueAssignment,
    submittedAssignment,
    gradedAssignment,
    archivedAssignment,
    foreignAssignment,
  ] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Active assignment for submission flow.",
        dueDate: new Date(futureStart.getTime() + 3 * 24 * 60 * 60 * 1000),
        scheduledClassId: directLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: activeAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Overdue assignment for student reminder flow.",
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        scheduledClassId: directLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: overdueAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Already submitted assignment for status filtering.",
        dueDate: new Date(futureStart.getTime() + 4 * 24 * 60 * 60 * 1000),
        scheduledClassId: groupLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: submittedAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Graded assignment for feedback display.",
        dueDate: new Date(futureStart.getTime() + 5 * 24 * 60 * 60 * 1000),
        scheduledClassId: groupLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: gradedAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        archivedAt: new Date(),
        description: "Archived assignment should be read-only.",
        dueDate: new Date(futureStart.getTime() + 2 * 24 * 60 * 60 * 1000),
        scheduledClassId: groupLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: archivedAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Foreign student assignment must stay hidden.",
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        scheduledClassId: foreignLesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: foreignAssignmentTitle,
      },
    }),
  ]);

  await Promise.all([
    prisma.courseMaterial.create({
      data: {
        description: "Material visible on assignment detail.",
        fileUrl: "/uploads/materials/student-assignment-notes.pdf",
        scheduledClassId: directLesson.id,
        teacherId: teacher.id,
        title: "Lesson notes",
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: submittedAssignment.id,
        contentUrl: SUBMITTED_WORK_URL,
        studentId: student.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: gradedAssignment.id,
        contentUrl: GRADED_WORK_URL,
        feedback: "Excellent reasoning. Tighten the final sentence.",
        grade: 94,
        studentId: student.id,
      },
    }),
  ]);

  return {
    activeAssignmentId: activeAssignment.id,
    activeLessonTitle: directLessonTitle,
    activeAssignmentTitle,
    archivedAssignmentId: archivedAssignment.id,
    archivedAssignmentTitle,
    foreignAssignmentId: foreignAssignment.id,
    foreignAssignmentTitle,
    gradedAssignmentId: gradedAssignment.id,
    gradedAssignmentTitle,
    groupName,
    overdueAssignmentId: overdueAssignment.id,
    overdueAssignmentTitle,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    subjectName,
    submittedAssignmentTitle,
  };
}

async function cleanupFixtures() {
  await prisma.submission.deleteMany({
    where: { assignment: { title: { contains: ASSIGNMENT_PREFIX } } },
  });
  await prisma.assignment.deleteMany({ where: { title: { contains: ASSIGNMENT_PREFIX } } });
  await prisma.courseMaterial.deleteMany({
    where: { scheduledClass: { title: { contains: LESSON_PREFIX } } },
  });
  await prisma.scheduledClass.deleteMany({ where: { title: { contains: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { contains: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
