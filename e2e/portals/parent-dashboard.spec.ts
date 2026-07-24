import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import {
  AttendanceStatus,
  ClassGroupStatus,
  LessonStatus,
  PerformanceLevel,
  PrismaClient,
  StudentLearningStatus,
  UserRole,
} from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.parent-dashboard.";
const ASSIGNMENT_PREFIX = "QA Parent Dashboard Assignment";
const FOREIGN_PREFIX = "QA Parent Dashboard Foreign";
const GROUP_PREFIX = "QA Parent Dashboard Group";
const LESSON_PREFIX = "QA Parent Dashboard Lesson";
const MATERIAL_PREFIX = "QA Parent Dashboard Material";
const SUBJECT_SLUG_PREFIX = "qa-parent-dashboard-subject";
const LEVEL_SLUG_PREFIX = "qa-parent-dashboard-level";
const TERM_PREFIX = "QA Parent Dashboard Term";

type ParentDashboardFixture = {
  assignmentTitle: string;
  childId: string;
  childName: string;
  foreignAssignmentTitle: string;
  foreignChildName: string;
  foreignLessonTitle: string;
  foreignMaterialTitle: string;
  lessonTitle: string;
  materialTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  progressText: string;
  reportTermName: string;
};

let fixture: ParentDashboardFixture;

async function setParentSession(page: Page) {
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
        email: fixture.parentEmail,
        fullName: fixture.parentName,
        role: UserRole.PARENT,
        uid: fixture.parentId,
      }),
    },
  ]);
}

test.describe("Parent dashboard final hub", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent sees linked child summaries, workflow links, and no unlinked child data", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);

    await expect(page.getByRole("heading", { level: 1, name: "Parent Dashboard" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: `Dashboard for ${fixture.childName}` }),
    ).toBeVisible();

    for (const heading of [
      /^schedule$/i,
      /^assignments$/i,
      /^materials$/i,
      /^attendance$/i,
      /^progress$/i,
      /^gradebook$/i,
      /^reports$/i,
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    await expect(page.getByText(fixture.lessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.assignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.materialTitle)).toBeVisible();
    await expect(page.getByText(/attendance rate:\s*50%|present:\s*1/i)).toBeVisible();
    await expect(page.getByText(fixture.progressText)).toBeVisible();
    await expect(page.getByText(/grade average|current term average/i)).toBeVisible();
    await expect(page.getByText(fixture.reportTermName)).toBeVisible();

    await expect(page.getByText(fixture.foreignChildName)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignLessonTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignMaterialTitle)).toHaveCount(0);

    await expect(page.getByRole("button", { name: /submit|upload|save|grade/i })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);

    for (const [name, route] of [
      [/open schedule/i, `/portal/parent/schedule?studentId=${fixture.childId}`],
      [/open assignments/i, `/portal/parent/assignments/${fixture.childId}`],
      [/open materials/i, `/portal/parent/materials/${fixture.childId}`],
      [/open attendance/i, `/portal/parent/attendance/${fixture.childId}`],
      [/open progress/i, `/portal/parent/progress/${fixture.childId}`],
      [/open gradebook/i, `/portal/parent/gradebook/${fixture.childId}`],
      [/open reports/i, `/portal/parent/reports/${fixture.childId}`],
    ] as const) {
      await page.goto(`${BASE_URL}/portal/parent`);
      await Promise.all([
        page.waitForURL((url) => `${url.pathname}${url.search}`.includes(route)),
        page.getByRole("link", { name }).click(),
      ]);
    }
  });

  test("parent with no linked children gets an accessible empty dashboard state", async ({
    page,
  }) => {
    const emptyParent = await createEmptyParentFixture();
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
          email: emptyParent.parentEmail,
          fullName: emptyParent.parentName,
          role: UserRole.PARENT,
          uid: emptyParent.parentId,
        }),
      },
    ]);

    await page.goto(`${BASE_URL}/portal/parent`);

    await expect(page.getByRole("status")).toContainText(/no linked students/i);
    await expect(page.getByRole("link", { name: /open schedule|open assignments/i })).toHaveCount(
      0,
    );
  });
});

async function createFixtures(): Promise<ParentDashboardFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const futureStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const pastStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(pastStart.getTime() + 60 * 60 * 1000);
  const parentName = `QA Parent Dashboard Parent ${suffix}`;
  const childName = `QA Parent Dashboard Child ${suffix}`;
  const foreignChildName = `QA Parent Dashboard Foreign Child ${suffix}`;
  const teacherName = `QA Parent Dashboard Teacher ${suffix}`;
  const subjectName = `QA Parent Dashboard Mathematics ${suffix}`;
  const reportTermName = `${TERM_PREFIX} Spring ${suffix}`;
  const lessonTitle = `${LESSON_PREFIX} Linked ${suffix}`;
  const foreignLessonTitle = `${FOREIGN_PREFIX} Lesson ${suffix}`;
  const assignmentTitle = `${ASSIGNMENT_PREFIX} Active ${suffix}`;
  const foreignAssignmentTitle = `${FOREIGN_PREFIX} Assignment ${suffix}`;
  const materialTitle = `${MATERIAL_PREFIX} Linked ${suffix}`;
  const foreignMaterialTitle = `${FOREIGN_PREFIX} Material ${suffix}`;
  const progressText = `Parent-visible progress ${suffix}`;

  const [teacher, child, foreignChild, parent, subject, level, term] = await Promise.all([
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
        email: `${USER_EMAIL_PREFIX}child.${suffix}@example.com`,
        fullName: childName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}foreign-child.${suffix}@example.com`,
        fullName: foreignChildName,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${USER_EMAIL_PREFIX}parent.${suffix}@example.com`,
        fullName: parentName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.PARENT,
      },
    }),
    prisma.subject.create({
      data: {
        description: "Parent dashboard E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Parent dashboard E2E level",
        name: `QA Parent Dashboard Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.academicTerm.create({
      data: {
        endDate: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000),
        isActive: true,
        name: reportTermName,
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  await prisma.appUser.update({
    where: { id: parent.id },
    data: { children: { connect: { id: child.id } } },
  });

  const [group, foreignGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        levelId: level.id,
        name: `${GROUP_PREFIX} Linked ${suffix}`,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: [{ id: child.id }] },
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
        students: { connect: [{ id: foreignChild.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
  ]);

  const [lesson, pastLesson, absentLesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: child.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
        title: lessonTitle,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: pastEnd,
        startAt: pastStart,
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: `${LESSON_PREFIX} Attendance ${suffix}`,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: new Date(pastEnd.getTime() + 60 * 60 * 1000),
        startAt: new Date(pastStart.getTime() + 60 * 60 * 1000),
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: `${LESSON_PREFIX} Absence ${suffix}`,
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
        title: foreignLessonTitle,
      },
    }),
  ]);

  const [assignment, foreignAssignment] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Parent dashboard pending assignment",
        dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        scheduledClassId: lesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: assignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Parent dashboard foreign assignment",
        dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
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
        description: "Parent dashboard linked material",
        fileUrl: `${BASE_URL}/e2e-assets/parent-dashboard-material.pdf`,
        scheduledClassId: lesson.id,
        teacherId: teacher.id,
        title: materialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Parent dashboard foreign material",
        fileUrl: `${BASE_URL}/e2e-assets/parent-dashboard-foreign.pdf`,
        scheduledClassId: foreignLesson.id,
        teacherId: teacher.id,
        title: foreignMaterialTitle,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: pastEnd,
        markedById: teacher.id,
        scheduledClassId: pastLesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: child.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: pastEnd,
        markedById: teacher.id,
        scheduledClassId: absentLesson.id,
        status: AttendanceStatus.ABSENT,
        studentId: child.id,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.GOOD,
        recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        studentId: child.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: progressText,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/parent-dashboard-submission.pdf`,
        feedback: "Parent dashboard grade feedback",
        grade: 84.7,
        studentId: child.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: foreignAssignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/parent-dashboard-foreign-submission.pdf`,
        feedback: "Foreign grade feedback",
        grade: 100,
        studentId: foreignChild.id,
      },
    }),
    prisma.reportSnapshot.create({
      data: {
        academicTermId: term.id,
        classGroupId: group.id,
        generatedByTeacherId: teacher.id,
        snapshotData: {
          academicTerm: { id: term.id, name: reportTermName },
          classGroup: { id: group.id, name: group.name },
          grades: { weightedTermAverage: 92 },
          student: { fullName: childName, id: child.id },
        },
        snapshotVersion: 1,
        studentId: child.id,
        teacherComment: "Parent dashboard report comment",
      },
    }),
  ]);

  return {
    assignmentTitle,
    childId: child.id,
    childName,
    foreignAssignmentTitle,
    foreignChildName,
    foreignLessonTitle,
    foreignMaterialTitle,
    lessonTitle,
    materialTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    progressText,
    reportTermName,
  };
}

async function createEmptyParentFixture(): Promise<ParentDashboardFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parent = await prisma.appUser.create({
    data: {
      email: `${USER_EMAIL_PREFIX}empty-parent.${suffix}@example.com`,
      fullName: `QA Parent Dashboard Empty Parent ${suffix}`,
      isActive: true,
      passwordHash: "not-used",
      role: UserRole.PARENT,
    },
  });

  return {
    assignmentTitle: "",
    childId: "",
    childName: "",
    foreignAssignmentTitle: "",
    foreignChildName: "",
    foreignLessonTitle: "",
    foreignMaterialTitle: "",
    lessonTitle: "",
    materialTitle: "",
    parentEmail: parent.email,
    parentId: parent.id,
    parentName: parent.fullName,
    progressText: "",
    reportTermName: "",
  };
}

async function cleanupFixtures() {
  await prisma.reportSnapshot.deleteMany({
    where: {
      OR: [
        { teacherComment: { contains: "Parent dashboard" } },
        { academicTerm: { name: { startsWith: TERM_PREFIX } } },
      ],
    },
  });
  await prisma.submission.deleteMany({
    where: { contentUrl: { contains: "parent-dashboard" } },
  });
  await prisma.attendanceRecord.deleteMany({
    where: { scheduledClass: { title: { startsWith: LESSON_PREFIX } } },
  });
  await prisma.studentProgress.deleteMany({
    where: { teacherNotes: { contains: "Parent-visible progress" } },
  });
  await prisma.courseMaterial.deleteMany({
    where: {
      OR: [{ title: { startsWith: MATERIAL_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.assignment.deleteMany({
    where: {
      OR: [{ title: { startsWith: ASSIGNMENT_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.scheduledClass.deleteMany({
    where: {
      OR: [{ title: { startsWith: LESSON_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: GROUP_PREFIX } } });
  await prisma.academicTerm.deleteMany({ where: { name: { startsWith: TERM_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
