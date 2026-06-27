import { type Locator, type Page, expect, test } from "@playwright/test";
import {
  ClassGroupStatus,
  LessonStatus,
  PrismaClient,
  StudentLearningStatus,
  UserRole,
} from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.teacher-dashboard.";
const LESSON_PREFIX = "QA Teacher Dashboard Lesson";
const GROUP_PREFIX = "QA Teacher Dashboard Group";
const ASSIGNMENT_PREFIX = "QA Teacher Dashboard Assignment";
const SUBJECT_SLUG_PREFIX = "qa-teacher-dashboard-subject";
const LEVEL_SLUG_PREFIX = "qa-teacher-dashboard-level";

type TeacherDashboardFixture = {
  teacherAEmail: string;
  teacherAName: string;
  teacherBHiddenAssignmentTitle: string;
  teacherBHiddenLessonTitle: string;
  teacherBHiddenStudentName: string;
  activeAssignmentTitle: string;
  cancelledLessonTitle: string;
  completedLessonTitle: string;
  feedbackText: string;
  groupName: string;
  missingLinkLessonTitle: string;
  pendingSubmissionId: string;
  pendingStudentName: string;
  rosterStudentName: string;
  subjectName: string;
  todayLessonId: string;
  todayLessonTitle: string;
  upcomingLessonTitle: string;
};

let fixture: TeacherDashboardFixture;

function testMeetUrl(path: string) {
  return `https://meet.google.com/${path}`;
}

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function lessonCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

async function loginAsTeacher(page: Page, email: string) {
  await page.goto(`${BASE_URL}/portal/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(/\/portal\/teacher/);
}

async function expectNoActiveStart(card: Locator) {
  await expect.soft(card.getByRole("link", { name: /start lesson/i })).toHaveCount(0, {
    timeout: 2_000,
  });

  const disabledButton = card.getByRole("button", { name: /start lesson/i });
  if ((await disabledButton.count()) > 0) {
    await expect.soft(disabledButton.first()).toBeDisabled();
  }
}

test.describe("Teacher dashboard portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("teacher sees a scoped dashboard with teacher routes, start states, and grading controls", async ({
    page,
  }) => {
    await loginAsTeacher(page, fixture.teacherAEmail);
    await page.goto(`${BASE_URL}/portal/teacher`);

    for (const heading of [
      /metrics/i,
      /today lessons/i,
      /upcoming lessons/i,
      /my classes/i,
      /grading workload/i,
      /^assignments$/i,
      /quick navigation/i,
    ]) {
      await expect.soft(page.getByRole("heading", { name: heading })).toBeVisible({
        timeout: 2_000,
      });
    }

    await expect(page.getByText(fixture.groupName).first()).toBeVisible();
    await expect(page.getByText(fixture.todayLessonTitle).first()).toBeVisible();
    await expect(page.getByText(fixture.upcomingLessonTitle).first()).toBeVisible();
    await expect(page.getByText(fixture.activeAssignmentTitle).first()).toBeVisible();
    await expect(page.getByText(fixture.pendingStudentName).first()).toBeVisible();
    await expect(page.getByText(fixture.rosterStudentName).first()).toBeVisible();
    await expect(page.getByText(fixture.subjectName).first()).toBeVisible();

    await expect(page.getByText(fixture.teacherBHiddenLessonTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.teacherBHiddenAssignmentTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.teacherBHiddenStudentName)).toHaveCount(0);

    const scheduleLink = page.getByRole("link", { name: /open schedule|full calendar/i }).first();
    await expect
      .soft(scheduleLink)
      .toHaveAttribute("href", /\/portal\/teacher\/schedule$/, { timeout: 2_000 });
    await expect
      .soft(scheduleLink)
      .not.toHaveAttribute("href", "/portal/schedule", { timeout: 2_000 });

    await expect
      .soft(
        page
          .getByRole("link", { name: new RegExp(`details.*${fixture.todayLessonTitle}`, "i") })
          .first(),
      )
      .toHaveAttribute("href", `/portal/teacher/lessons/${fixture.todayLessonId}`);
    await expect
      .soft(page.getByRole("link", { name: /availability/i }))
      .toHaveAttribute("href", "/portal/teacher/availability", { timeout: 2_000 });

    const todayCard = lessonCard(page, fixture.todayLessonTitle);
    const todayStartLink = todayCard.getByRole("link", { name: /start lesson/i });
    await expect.soft(todayStartLink).toHaveCount(1, { timeout: 2_000 });
    await expect.soft(todayStartLink).toHaveAttribute("target", "_blank", { timeout: 2_000 });
    await expect.soft(todayStartLink).toHaveAttribute("rel", "noreferrer", { timeout: 2_000 });

    await expectNoActiveStart(lessonCard(page, fixture.upcomingLessonTitle));
    await expectNoActiveStart(lessonCard(page, fixture.cancelledLessonTitle));
    await expectNoActiveStart(lessonCard(page, fixture.completedLessonTitle));

    const missingLinkCard = lessonCard(page, fixture.missingLinkLessonTitle);
    await expect.soft(missingLinkCard).toContainText(/meeting link missing/i, { timeout: 2_000 });
    await expectNoActiveStart(missingLinkCard);

    const pendingSubmissionCard = page.locator("article").filter({
      hasText: fixture.pendingStudentName,
    });
    await expect(pendingSubmissionCard.first()).toBeVisible();
    const scoreInput = pendingSubmissionCard.getByPlaceholder(/score 0-100/i);
    await expect.soft(scoreInput).toHaveAttribute("type", "number", { timeout: 2_000 });
    await expect.soft(scoreInput).toHaveAttribute("min", "0", { timeout: 2_000 });
    await expect.soft(scoreInput).toHaveAttribute("max", "100", { timeout: 2_000 });
    await expect.soft(pendingSubmissionCard.getByLabel(/score 0-100/i)).toBeVisible({
      timeout: 2_000,
    });
    await expect.soft(pendingSubmissionCard.getByLabel(/feedback/i)).toBeVisible({
      timeout: 2_000,
    });
    await expect
      .soft(pendingSubmissionCard.getByRole("button", { name: /save grade/i }))
      .toBeVisible({ timeout: 2_000 });

    if ((await scoreInput.count()) > 0) {
      await scoreInput.fill("92");
      await pendingSubmissionCard.getByLabel(/feedback/i).fill(fixture.feedbackText);
      await pendingSubmissionCard.getByRole("button", { name: /save grade/i }).click();
      await expect
        .poll(async () => {
          const submission = await prisma.submission.findUnique({
            select: { feedback: true, grade: true },
            where: { id: fixture.pendingSubmissionId },
          });

          return `${submission?.grade ?? ""}:${submission?.feedback ?? ""}`;
        })
        .toBe(`92:${fixture.feedbackText}`);
    }
  });
});

async function createFixtures(): Promise<TeacherDashboardFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const passwordHash = await hashPassword(PASSWORD);
  const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const rangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const teacherAName = `QA Teacher Dashboard A ${suffix}`;
  const teacherBName = `QA Teacher Dashboard B ${suffix}`;
  const pendingStudentName = `QA Teacher Dashboard Pending Student ${suffix}`;
  const rosterStudentName = `QA Teacher Dashboard Roster Student ${suffix}`;
  const teacherBHiddenStudentName = `QA Teacher Dashboard Hidden Student ${suffix}`;
  const subjectName = `QA Teacher Dashboard Mathematics ${suffix}`;
  const levelName = `QA Teacher Dashboard Level ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const teacherBGroupName = `${GROUP_PREFIX} B ${suffix}`;
  const todayLessonTitle = `${LESSON_PREFIX} Today Joinable ${suffix}`;
  const upcomingLessonTitle = `${LESSON_PREFIX} Upcoming Not Joinable ${suffix}`;
  const cancelledLessonTitle = `${LESSON_PREFIX} Cancelled ${suffix}`;
  const completedLessonTitle = `${LESSON_PREFIX} Completed ${suffix}`;
  const missingLinkLessonTitle = `${LESSON_PREFIX} Missing Link ${suffix}`;
  const teacherBHiddenLessonTitle = `${LESSON_PREFIX} Teacher B Hidden ${suffix}`;
  const activeAssignmentTitle = `${ASSIGNMENT_PREFIX} Active ${suffix}`;
  const teacherBHiddenAssignmentTitle = `${ASSIGNMENT_PREFIX} Teacher B Hidden ${suffix}`;
  const feedbackText = `Dashboard grade feedback ${suffix}`;

  const [teacherA, teacherB, pendingStudent, rosterStudent, teacherBStudent, subject, level] =
    await Promise.all([
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher-a.${suffix}@example.com`,
          fullName: teacherAName,
          isActive: true,
          passwordHash,
          role: UserRole.TEACHER,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher-b.${suffix}@example.com`,
          fullName: teacherBName,
          isActive: true,
          passwordHash,
          role: UserRole.TEACHER,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}pending-student.${suffix}@example.com`,
          fullName: pendingStudentName,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash,
          role: UserRole.STUDENT,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}roster-student.${suffix}@example.com`,
          fullName: rosterStudentName,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash,
          role: UserRole.STUDENT,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher-b-student.${suffix}@example.com`,
          fullName: teacherBHiddenStudentName,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash,
          role: UserRole.STUDENT,
        },
      }),
      prisma.subject.create({
        data: {
          description: "Subject fixture for teacher dashboard E2E.",
          isActive: true,
          name: subjectName,
          priority: 92,
          slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
        },
      }),
      prisma.level.create({
        data: {
          description: "Level fixture for teacher dashboard E2E.",
          name: levelName,
          slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
        },
      }),
    ]);

  const [group, teacherBGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        description: "Teacher A group for teacher dashboard E2E.",
        endDate: rangeEnd,
        levelId: level.id,
        name: groupName,
        startDate: rangeStart,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacherA.id,
        students: { connect: [{ id: pendingStudent.id }, { id: rosterStudent.id }] },
      },
    }),
    prisma.classGroup.create({
      data: {
        capacity: 12,
        description: "Teacher B group that Teacher A must not see.",
        endDate: rangeEnd,
        levelId: level.id,
        name: teacherBGroupName,
        startDate: rangeStart,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacherB.id,
        students: { connect: { id: teacherBStudent.id } },
      },
    }),
  ]);

  const todayLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      description: "Today joinable teacher dashboard lesson.",
      endAt: addMinutes(now, 65),
      liveLessonUrl: testMeetUrl("teacher-dashboard-today"),
      status: LessonStatus.SCHEDULED,
      subjectId: subject.id,
      teacherId: teacherA.id,
      timezone: "Africa/Nairobi",
      title: todayLessonTitle,
      startAt: addMinutes(now, 5),
    },
  });

  await prisma.scheduledClass.createMany({
    data: [
      {
        classGroupId: group.id,
        description: "Future teacher dashboard lesson outside start window.",
        endAt: addMinutes(now, 24 * 60 + 60),
        liveLessonUrl: testMeetUrl("teacher-dashboard-upcoming"),
        status: LessonStatus.SCHEDULED,
        subjectId: subject.id,
        teacherId: teacherA.id,
        timezone: "Africa/Nairobi",
        title: upcomingLessonTitle,
        startAt: addMinutes(now, 24 * 60),
      },
      {
        cancelReason: "Teacher unavailable",
        cancelledAt: new Date(),
        classGroupId: group.id,
        description: "Cancelled teacher dashboard lesson.",
        endAt: addMinutes(now, 180),
        liveLessonUrl: testMeetUrl("teacher-dashboard-cancelled"),
        status: LessonStatus.CANCELLED,
        subjectId: subject.id,
        teacherId: teacherA.id,
        timezone: "Africa/Nairobi",
        title: cancelledLessonTitle,
        startAt: addMinutes(now, 120),
      },
      {
        classGroupId: group.id,
        description: "Completed teacher dashboard lesson.",
        endAt: addMinutes(now, -30),
        liveLessonUrl: testMeetUrl("teacher-dashboard-completed"),
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacherA.id,
        timezone: "Africa/Nairobi",
        title: completedLessonTitle,
        startAt: addMinutes(now, -90),
      },
      {
        classGroupId: group.id,
        description: "Teacher dashboard lesson with missing meeting link.",
        endAt: addMinutes(now, 300),
        liveLessonUrl: "",
        status: LessonStatus.SCHEDULED,
        subjectId: subject.id,
        teacherId: teacherA.id,
        timezone: "Africa/Nairobi",
        title: missingLinkLessonTitle,
        startAt: addMinutes(now, 240),
      },
    ],
  });

  const teacherBHiddenLesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: teacherBGroup.id,
      description: "Teacher B lesson that Teacher A must not see.",
      endAt: addMinutes(now, 420),
      liveLessonUrl: testMeetUrl("teacher-dashboard-hidden"),
      status: LessonStatus.SCHEDULED,
      subjectId: subject.id,
      teacherId: teacherB.id,
      timezone: "Africa/Nairobi",
      title: teacherBHiddenLessonTitle,
      startAt: addMinutes(now, 360),
    },
  });

  const [activeAssignment, teacherBHiddenAssignment] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Active assignment visible on Teacher A dashboard.",
        dueDate: addMinutes(now, 2 * 24 * 60),
        scheduledClassId: todayLesson.id,
        subjectId: subject.id,
        teacherId: teacherA.id,
        title: activeAssignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Teacher B assignment that Teacher A must not see.",
        dueDate: addMinutes(now, 2 * 24 * 60),
        scheduledClassId: teacherBHiddenLesson.id,
        subjectId: subject.id,
        teacherId: teacherB.id,
        title: teacherBHiddenAssignmentTitle,
      },
    }),
  ]);

  const [pendingSubmission] = await Promise.all([
    prisma.submission.create({
      data: {
        assignmentId: activeAssignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/submissions/teacher-dashboard.pdf`,
        feedback: "Ready for dashboard review",
        grade: null,
        studentId: pendingStudent.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: teacherBHiddenAssignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/submissions/teacher-dashboard-hidden.pdf`,
        feedback: "Hidden teacher review",
        grade: null,
        studentId: teacherBStudent.id,
      },
    }),
  ]);

  return {
    activeAssignmentTitle,
    cancelledLessonTitle,
    completedLessonTitle,
    feedbackText,
    groupName,
    missingLinkLessonTitle,
    pendingSubmissionId: pendingSubmission.id,
    pendingStudentName,
    rosterStudentName,
    subjectName,
    teacherAEmail: teacherA.email,
    teacherAName,
    teacherBHiddenAssignmentTitle,
    teacherBHiddenLessonTitle,
    teacherBHiddenStudentName,
    todayLessonId: todayLesson.id,
    todayLessonTitle,
    upcomingLessonTitle,
  };
}

async function cleanupFixtures() {
  const groups = await prisma.classGroup.findMany({
    select: { id: true },
    where: { name: { startsWith: GROUP_PREFIX } },
  });
  const lessons = await prisma.scheduledClass.findMany({
    select: { id: true },
    where: {
      OR: [
        { title: { startsWith: LESSON_PREFIX } },
        { classGroupId: { in: groups.map((group) => group.id) } },
      ],
    },
  });
  const lessonIds = lessons.map((lesson) => lesson.id);
  const users = await prisma.appUser.findMany({
    select: { id: true },
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
  });
  const userIds = users.map((user) => user.id);
  const assignments = await prisma.assignment.findMany({
    select: { id: true },
    where: {
      OR: [{ scheduledClassId: { in: lessonIds } }, { title: { startsWith: ASSIGNMENT_PREFIX } }],
    },
  });
  const assignmentIds = assignments.map((assignment) => assignment.id);

  await prisma.submission.deleteMany({
    where: {
      OR: [{ studentId: { in: userIds } }, { assignmentId: { in: assignmentIds } }],
    },
  });
  await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  await prisma.courseMaterial.deleteMany({ where: { scheduledClassId: { in: lessonIds } } });
  await prisma.scheduledClass.deleteMany({ where: { id: { in: lessonIds } } });

  for (const group of groups) {
    await prisma.classGroup.update({
      data: { students: { set: [] } },
      where: { id: group.id },
    });
  }

  await prisma.classGroup.deleteMany({ where: { id: { in: groups.map((group) => group.id) } } });
  await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
}
