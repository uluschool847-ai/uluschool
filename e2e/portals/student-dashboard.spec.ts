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

const USER_EMAIL_PREFIX = "qa.student-dashboard.";
const ASSIGNMENT_PREFIX = "QA Student Dashboard Assignment";
const FOREIGN_PREFIX = "QA Student Dashboard Foreign";
const GROUP_PREFIX = "QA Student Dashboard Group";
const LESSON_PREFIX = "QA Student Dashboard Lesson";
const MATERIAL_PREFIX = "QA Student Dashboard Material";
const SUBJECT_SLUG_PREFIX = "qa-student-dashboard-subject";
const LEVEL_SLUG_PREFIX = "qa-student-dashboard-level";
const TERM_PREFIX = "QA Student Dashboard Term";

type StudentDashboardFixture = {
  assignmentTitle: string;
  foreignAssignmentTitle: string;
  foreignLessonTitle: string;
  foreignMaterialTitle: string;
  lessonTitle: string;
  materialTitle: string;
  progressText: string;
  reportTermName: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
};

let fixture: StudentDashboardFixture;

async function setStudentSession(page: Page, input = fixture) {
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
        email: input.studentEmail,
        fullName: input.studentName,
        role: UserRole.STUDENT,
        uid: input.studentId,
      }),
    },
  ]);
}

test.describe("Student dashboard final hub", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student sees owned summaries and can navigate from every final dashboard card", async ({
    page,
  }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student`);

    await expect(page.getByRole("heading", { name: /student dashboard/i })).toBeVisible();
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
    await expect(page.getByText(/attendance rate|present/i)).toBeVisible();
    await expect(page.getByText(fixture.progressText)).toBeVisible();
    await expect(page.getByText(/grade average|current term average/i)).toBeVisible();
    await expect(page.getByText(fixture.reportTermName)).toBeVisible();

    await expect(page.getByText(fixture.foreignLessonTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignMaterialTitle)).toHaveCount(0);

    for (const [name, route] of [
      [/open schedule/i, "/portal/student/schedule"],
      [/open assignments/i, "/portal/student/assignments"],
      [/open materials/i, "/portal/student/materials"],
      [/open attendance/i, "/portal/student/attendance"],
      [/open progress/i, "/portal/student/progress"],
      [/open gradebook/i, "/portal/student/gradebook"],
      [/open reports/i, "/portal/student/reports"],
    ] as const) {
      await page.goto(`${BASE_URL}/portal/student`);
      await Promise.all([
        page.waitForURL(new RegExp(route.replaceAll("/", "\\/"))),
        page.getByRole("link", { name }).click(),
      ]);
      expect(page.url()).toContain(route);
    }
  });

  test("student with no activity gets accessible empty dashboard states", async ({ page }) => {
    const empty = await createEmptyStudentFixture();
    await setStudentSession(page, empty);
    await page.goto(`${BASE_URL}/portal/student`);

    await expect(page.getByRole("status", { name: /schedule/i })).toContainText(
      /no upcoming lessons/i,
    );
    await expect(page.getByRole("status", { name: /assignments/i })).toContainText(
      /no pending assignments/i,
    );
    await expect(page.getByRole("status", { name: /materials/i })).toContainText(/no materials/i);
    await expect(page.getByRole("status", { name: /attendance/i })).toContainText(
      /no attendance records/i,
    );
    await expect(page.getByRole("status", { name: /progress/i })).toContainText(
      /no progress notes/i,
    );
    await expect(page.getByRole("status", { name: /gradebook/i })).toContainText(
      /no grade average/i,
    );
    await expect(page.getByRole("status", { name: /reports/i })).toContainText(/no reports/i);
  });
});

async function createFixtures(): Promise<StudentDashboardFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const futureStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const pastStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const pastEnd = new Date(pastStart.getTime() + 60 * 60 * 1000);
  const studentName = `QA Student Dashboard Student ${suffix}`;
  const foreignStudentName = `QA Student Dashboard Foreign Student ${suffix}`;
  const teacherName = `QA Student Dashboard Teacher ${suffix}`;
  const subjectName = `QA Student Dashboard Mathematics ${suffix}`;
  const reportTermName = `${TERM_PREFIX} Spring ${suffix}`;
  const lessonTitle = `${LESSON_PREFIX} Owned ${suffix}`;
  const foreignLessonTitle = `${FOREIGN_PREFIX} Lesson ${suffix}`;
  const assignmentTitle = `${ASSIGNMENT_PREFIX} Active ${suffix}`;
  const foreignAssignmentTitle = `${FOREIGN_PREFIX} Assignment ${suffix}`;
  const materialTitle = `${MATERIAL_PREFIX} Owned ${suffix}`;
  const foreignMaterialTitle = `${FOREIGN_PREFIX} Material ${suffix}`;
  const progressText = `Strong dashboard progress ${suffix}`;

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
        description: "Student dashboard E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student dashboard E2E level",
        name: `QA Student Dashboard Level ${suffix}`,
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

  const [lesson, pastLesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: futureEnd,
        liveLessonUrl: `${BASE_URL}/e2e-assets/student-dashboard-live`,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: student.id }] },
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
        description: "Student dashboard pending assignment",
        dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        scheduledClassId: lesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: assignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Student dashboard foreign assignment",
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
        description: "Student dashboard owned material",
        fileUrl: `${BASE_URL}/e2e-assets/student-dashboard-material.pdf`,
        scheduledClassId: lesson.id,
        teacherId: teacher.id,
        title: materialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Student dashboard foreign material",
        fileUrl: `${BASE_URL}/e2e-assets/student-dashboard-foreign.pdf`,
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
        studentId: student.id,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.GOOD,
        recordedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: progressText,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/student-dashboard-submission.pdf`,
        feedback: "Dashboard grade feedback",
        grade: 84.7,
        studentId: student.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: foreignAssignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/student-dashboard-foreign-submission.pdf`,
        feedback: "Foreign grade feedback",
        grade: 100,
        studentId: foreignStudent.id,
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
          student: { fullName: studentName, id: student.id },
        },
        snapshotVersion: 1,
        studentId: student.id,
        teacherComment: "Dashboard report comment",
      },
    }),
  ]);

  return {
    assignmentTitle,
    foreignAssignmentTitle,
    foreignLessonTitle,
    foreignMaterialTitle,
    lessonTitle,
    materialTitle,
    progressText,
    reportTermName,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
  };
}

async function createEmptyStudentFixture(): Promise<StudentDashboardFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const student = await prisma.appUser.create({
    data: {
      email: `${USER_EMAIL_PREFIX}empty-student.${suffix}@example.com`,
      fullName: `QA Student Dashboard Empty Student ${suffix}`,
      isActive: true,
      learningStatus: StudentLearningStatus.ACTIVE,
      passwordHash: "not-used",
      role: UserRole.STUDENT,
    },
  });

  return {
    assignmentTitle: "",
    foreignAssignmentTitle: "",
    foreignLessonTitle: "",
    foreignMaterialTitle: "",
    lessonTitle: "",
    materialTitle: "",
    progressText: "",
    reportTermName: "",
    studentEmail: student.email,
    studentId: student.id,
    studentName: student.fullName,
  };
}

async function cleanupFixtures() {
  await prisma.reportSnapshot.deleteMany({
    where: {
      OR: [
        { teacherComment: { contains: "Dashboard report" } },
        { academicTerm: { name: { startsWith: TERM_PREFIX } } },
      ],
    },
  });
  await prisma.submission.deleteMany({
    where: { contentUrl: { contains: "student-dashboard" } },
  });
  await prisma.attendanceRecord.deleteMany({
    where: { scheduledClass: { title: { startsWith: LESSON_PREFIX } } },
  });
  await prisma.studentProgress.deleteMany({
    where: { teacherNotes: { contains: "dashboard progress" } },
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
