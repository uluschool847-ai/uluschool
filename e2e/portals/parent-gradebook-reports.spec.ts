import { type Page, expect, test } from "@playwright/test";
import {
  AttendanceStatus,
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

const USER_EMAIL_PREFIX = "qa.parent-gradebook-reports.";
const ASSIGNMENT_PREFIX = "QA Parent Gradebook Reports Assignment";
const GROUP_PREFIX = "QA Parent Gradebook Reports Group";
const LEVEL_SLUG_PREFIX = "qa-parent-gradebook-reports-level";
const LESSON_PREFIX = "QA Parent Gradebook Reports Lesson";
const MANUAL_PREFIX = "QA Parent Gradebook Reports Manual";
const SUBJECT_SLUG_PREFIX = "qa-parent-gradebook-reports-subject";
const TERM_PREFIX = "QA Parent Gradebook Reports Term";

type ParentGradebookReportsFixture = {
  attendanceLessonTitle: string;
  archivedManualTitle: string;
  foreignReportTitle: string;
  foreignStudentId: string;
  homeworkFeedback: string;
  homeworkTitle: string;
  manualDescription: string;
  manualTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  progressContent: string;
  safePdfPath: string;
  snapshotId: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  teacherComment: string;
  termId: string;
  termName: string;
};

let fixture: ParentGradebookReportsFixture;

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

function gradeRow(page: Page, title: string) {
  return page.locator("article, li, tr").filter({ hasText: title }).first();
}

test.describe("Parent gradebook and reports portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent reviews linked-child gradebook and immutable reports without mutation controls", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);

    await Promise.all([
      page.waitForURL(new RegExp(`/portal/parent/gradebook/${fixture.studentId}`)),
      page.getByRole("link", { name: /open gradebook/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /gradebook/i })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.termName)).toBeVisible();
    await expect(page.getByText(/weighted average:\s*84\.7/i)).toBeVisible();
    await expect(page.getByRole("region", { name: /homework/i })).toContainText(/weight:\s*70%/i);
    await expect(page.getByRole("region", { name: /manual/i })).toContainText(/weight:\s*30%/i);

    const homeworkRow = gradeRow(page, fixture.homeworkTitle);
    await expect(homeworkRow).toContainText(/82/);
    await expect(homeworkRow).toContainText(fixture.homeworkFeedback);

    const manualRow = gradeRow(page, fixture.manualTitle);
    await expect(manualRow).toContainText(/91/);
    await expect(manualRow).toContainText(fixture.manualDescription);
    await expect(page.getByText(fixture.archivedManualTitle)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create|edit|archive|delete|save/i }),
    ).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/parent`);
    await Promise.all([
      page.waitForURL(new RegExp(`/portal/parent/reports/${fixture.studentId}`)),
      page.getByRole("link", { name: /open reports/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /^reports$/i })).toBeVisible();
    await expect(page.getByLabel(/search/i)).toBeVisible();
    await expect(page.getByText(fixture.termName)).toBeVisible();
    await expect(page.getByText(fixture.teacherComment)).toBeVisible();
    await expect(page.getByText(/weighted average:\s*92/i)).toBeVisible();
    await expect(page.getByText(fixture.foreignReportTitle)).toHaveCount(0);

    await page.getByLabel(/search/i).fill(fixture.termName);
    await page.getByRole("button", { name: /apply|filter|show reports/i }).click();
    await expect(page.getByText(fixture.termName)).toBeVisible();

    await Promise.all([
      page.waitForURL(
        new RegExp(`/portal/parent/reports/${fixture.studentId}/${fixture.snapshotId}$`),
      ),
      page.getByRole("link", { name: /view report/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /^report$/i })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.termName)).toBeVisible();
    await expect(page.getByText(fixture.homeworkTitle)).toBeVisible();
    await expect(page.getByText(fixture.manualTitle)).toBeVisible();
    await expect(page.getByText(/present:\s*8/i)).toBeVisible();
    await expect(page.getByText(fixture.attendanceLessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.progressContent)).toBeVisible();
    await expect(page.getByText(fixture.teacherComment)).toBeVisible();
    await expect(page.getByRole("link", { name: /download pdf|open pdf/i })).toHaveAttribute(
      "href",
      fixture.safePdfPath,
    );
    await expect(page.getByRole("button", { name: /export|regenerate|delete|save/i })).toHaveCount(
      0,
    );

    await page.goto(`${BASE_URL}/portal/parent/gradebook/${fixture.foreignStudentId}`);
    await expect(page.getByText(fixture.homeworkTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/parent/reports/${fixture.foreignStudentId}`);
    await expect(page.getByText(fixture.foreignReportTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<ParentGradebookReportsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentName = `QA Parent Gradebook Reports Parent ${suffix}`;
  const studentName = `QA Parent Gradebook Reports Student ${suffix}`;
  const foreignStudentName = `QA Parent Gradebook Reports Foreign Student ${suffix}`;
  const teacherName = `QA Parent Gradebook Reports Teacher ${suffix}`;
  const subjectName = `QA Parent Gradebook Reports Mathematics ${suffix}`;
  const termName = `${TERM_PREFIX} Spring ${suffix}`;
  const foreignReportTitle = `${TERM_PREFIX} Foreign ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const homeworkTitle = `${ASSIGNMENT_PREFIX} Quadratics ${suffix}`;
  const manualTitle = `${MANUAL_PREFIX} Oral checkpoint ${suffix}`;
  const archivedManualTitle = `${MANUAL_PREFIX} Archived draft ${suffix}`;
  const homeworkFeedback = `Strong quadratic reasoning ${suffix}`;
  const manualDescription = `Confident oral explanation ${suffix}`;
  const teacherComment = `Keep practicing transformations ${suffix}`;
  const attendanceLessonTitle = `${LESSON_PREFIX} Attendance ${suffix}`;
  const progressContent = `QA Parent Gradebook Reports Progress ${suffix}`;
  const safePdfPath = `/uploads/reports/parent-gradebook-reports-${suffix}.pdf`;

  const [teacher, student, foreignStudent, parent, subject, level, term, foreignTerm] =
    await Promise.all([
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
          description: "Parent gradebook reports E2E subject",
          isActive: true,
          name: subjectName,
          slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
        },
      }),
      prisma.level.create({
        data: {
          description: "Parent gradebook reports E2E level",
          name: `QA Parent Gradebook Reports Level ${suffix}`,
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
          name: foreignReportTitle,
          startDate: new Date("2026-07-01T00:00:00.000Z"),
        },
      }),
    ]);

  await prisma.appUser.update({
    data: { children: { connect: [{ id: student.id }] } },
    where: { id: parent.id },
  });

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

  const lesson = await prisma.scheduledClass.create({
    data: {
      classGroupId: group.id,
      endAt: new Date("2026-03-09T11:00:00.000Z"),
      startAt: new Date("2026-03-09T10:00:00.000Z"),
      status: LessonStatus.COMPLETED,
      subjectId: subject.id,
      teacherId: teacher.id,
      timezone: "Europe/Kiev",
      title: attendanceLessonTitle,
    },
  });

  const assignment = await prisma.assignment.create({
    data: {
      description: "Parent gradebook reports homework fixture",
      dueDate: new Date("2026-03-09T12:00:00.000Z"),
      scheduledClassId: lesson.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      title: homeworkTitle,
    },
  });

  await Promise.all([
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: "/uploads/parent-gradebook-reports-homework.pdf",
        feedback: homeworkFeedback,
        grade: 82,
        studentId: student.id,
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
        description: "Archived draft should be visible as history",
        gradedAt: new Date("2026-03-08T10:00:00.000Z"),
        score: 50,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: archivedManualTitle,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: new Date("2026-03-09T10:05:00.000Z"),
        markedById: teacher.id,
        scheduledClassId: lesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: student.id,
      },
    }),
  ]);

  const snapshotData = {
    academicTerm: { id: term.id, name: termName },
    attendance: { absent: 1, late: 1, present: 8 },
    attendanceHistory: [{ lessonTitle: attendanceLessonTitle, status: "PRESENT" }],
    classGroup: { id: group.id, name: group.name },
    grades: {
      categories: [
        { average: 82, label: "Homework", weight: 70 },
        { average: 91, label: "Manual", weight: 30 },
      ],
      homeworkGrades: [{ feedback: homeworkFeedback, score: 82, title: homeworkTitle }],
      manualGrades: [{ description: manualDescription, score: 91, title: manualTitle }],
      weightedTermAverage: 92,
    },
    progressNotes: [{ content: progressContent, performanceLevel: "GOOD" }],
    student: { fullName: studentName, id: student.id },
    teacherComment,
  };

  const [snapshot] = await Promise.all([
    prisma.reportSnapshot.create({
      data: {
        academicTermId: term.id,
        classGroupId: group.id,
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        generatedByTeacherId: teacher.id,
        pdfGeneratedAt: new Date("2026-05-20T10:05:00.000Z"),
        pdfStorageKey: safePdfPath,
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
          academicTerm: { id: foreignTerm.id, name: foreignReportTitle },
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
    archivedManualTitle,
    foreignReportTitle,
    foreignStudentId: foreignStudent.id,
    homeworkFeedback,
    homeworkTitle,
    manualDescription,
    manualTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    progressContent,
    safePdfPath,
    snapshotId: snapshot.id,
    studentId: student.id,
    studentName,
    subjectName,
    teacherComment,
    termId: term.id,
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
  await prisma.attendanceRecord.deleteMany({
    where: { scheduledClass: { title: { startsWith: LESSON_PREFIX } } },
  });
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
