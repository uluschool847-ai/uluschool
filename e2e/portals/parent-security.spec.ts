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

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.parent-security.";
const ASSIGNMENT_PREFIX = "QA Parent Security Assignment";
const FOREIGN_PREFIX = "QA Parent Security Foreign";
const GROUP_PREFIX = "QA Parent Security Group";
const LESSON_PREFIX = "QA Parent Security Lesson";
const MATERIAL_PREFIX = "QA Parent Security Material";
const MANUAL_PREFIX = "QA Parent Security Manual";
const SUBJECT_SLUG_PREFIX = "qa-parent-security-subject";
const LEVEL_SLUG_PREFIX = "qa-parent-security-level";
const TERM_PREFIX = "QA Parent Security Term";

type ParentSecurityFixture = {
  assignmentId: string;
  assignmentTitle: string;
  childId: string;
  childName: string;
  foreignAssignmentId: string;
  foreignAssignmentTitle: string;
  foreignChildId: string;
  foreignChildName: string;
  foreignLessonId: string;
  foreignLessonTitle: string;
  foreignMaterialTitle: string;
  foreignProgressText: string;
  foreignReportComment: string;
  homeworkFeedback: string;
  lessonId: string;
  lessonTitle: string;
  manualTitle: string;
  materialTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  progressText: string;
  reportComment: string;
  snapshotId: string;
  studentEmail: string;
  subjectName: string;
  teacherEmail: string;
  teacherId: string;
  teacherName: string;
  termName: string;
};

let fixture: ParentSecurityFixture;

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

async function setSession(
  page: Page,
  input: { email: string; fullName: string; role: UserRole; uid: string },
) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      domain: COOKIE_DOMAIN,
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      name: "ulu_session",
      path: "/",
      sameSite: "Lax",
      value: await createSessionToken(input),
    },
  ]);
}

async function setParentSession(page: Page) {
  await setSession(page, {
    email: fixture.parentEmail,
    fullName: fixture.parentName,
    role: UserRole.PARENT,
    uid: fixture.parentId,
  });
}

async function expectNoMutationControls(page: Page) {
  await expect(
    page.getByRole("button", {
      name: /\b(submit|resubmit|upload|create|edit|archive|delete|save|mark attendance|update attendance|update grade|generate report|export report|link child|unlink child|change password)\b/i,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /password|new email|role/i })).toHaveCount(0);
}

async function expectForeignDataHidden(page: Page) {
  for (const hiddenText of [
    fixture.foreignChildName,
    fixture.foreignLessonTitle,
    fixture.foreignAssignmentTitle,
    fixture.foreignMaterialTitle,
    fixture.foreignProgressText,
    fixture.foreignReportComment,
  ]) {
    await expect(page.getByText(hiddenText)).toHaveCount(0);
  }
}

test.describe("Parent cabinet final security and read-only gate", () => {
  test.describe.configure({ timeout: 300000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent sees linked data only and has no mutation controls across parent routes", async ({
    page,
  }) => {
    await setParentSession(page);

    const linkedRoutes: Array<[string, RegExp | string]> = [
      ["/portal/parent", new RegExp(fixture.childName)],
      [`/portal/parent/schedule/${fixture.childId}/${fixture.lessonId}`, fixture.lessonTitle],
      [`/portal/parent/assignments/${fixture.childId}`, fixture.assignmentTitle],
      [
        `/portal/parent/assignments/${fixture.childId}/${fixture.assignmentId}`,
        fixture.homeworkFeedback,
      ],
      [`/portal/parent/materials/${fixture.childId}`, fixture.materialTitle],
      [`/portal/parent/progress/${fixture.childId}`, fixture.progressText],
      [`/portal/parent/attendance/${fixture.childId}`, fixture.lessonTitle],
      [`/portal/parent/gradebook/${fixture.childId}`, fixture.manualTitle],
      [`/portal/parent/reports/${fixture.childId}`, fixture.reportComment],
      [`/portal/parent/reports/${fixture.childId}/${fixture.snapshotId}`, fixture.reportComment],
      ["/portal/parent/profile", fixture.childName],
    ];

    for (const [route, visibleText] of linkedRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await expect(page.getByText(visibleText).first()).toBeVisible();
      await expectForeignDataHidden(page);
      await expectNoMutationControls(page);
    }
  });

  test("parent direct unlinked URLs do not expose foreign child data", async ({ page }) => {
    await setParentSession(page);

    for (const route of [
      `/portal/parent/schedule/${fixture.foreignChildId}/${fixture.foreignLessonId}`,
      `/portal/parent/assignments/${fixture.foreignChildId}`,
      `/portal/parent/assignments/${fixture.foreignChildId}/${fixture.foreignAssignmentId}`,
      `/portal/parent/materials/${fixture.foreignChildId}`,
      `/portal/parent/progress/${fixture.foreignChildId}`,
      `/portal/parent/attendance/${fixture.foreignChildId}`,
      `/portal/parent/gradebook/${fixture.foreignChildId}`,
      `/portal/parent/reports/${fixture.foreignChildId}`,
      `/portal/parent/reports/${fixture.foreignChildId}/${fixture.snapshotId}`,
      `/portal/parent/profile?parentId=foreign-parent&studentId=${fixture.foreignChildId}`,
    ]) {
      await page.goto(`${BASE_URL}${route}`);
      await expectForeignDataHidden(page);
      await expectNoMutationControls(page);
    }
  });

  test("student and teacher sessions cannot use the parent cabinet", async ({ page }) => {
    await setSession(page, {
      email: fixture.studentEmail,
      fullName: fixture.childName,
      role: UserRole.STUDENT,
      uid: fixture.childId,
    });
    await page.goto(`${BASE_URL}/portal/parent`);
    await expect(page).not.toHaveURL(/\/portal\/parent$/);

    await setSession(page, {
      email: fixture.teacherEmail,
      fullName: fixture.teacherName,
      role: UserRole.TEACHER,
      uid: fixture.teacherId,
    });
    await page.goto(`${BASE_URL}/portal/parent`);
    await expect(page).not.toHaveURL(/\/portal\/parent$/);
  });
});

async function createFixtures(): Promise<ParentSecurityFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const lessonStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lessonEnd = new Date(lessonStart.getTime() + 60 * 60 * 1000);
  const dueDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const parentName = `QA Parent Security Parent ${suffix}`;
  const childName = `QA Parent Security Child ${suffix}`;
  const foreignChildName = `${FOREIGN_PREFIX} Child ${suffix}`;
  const teacherName = `QA Parent Security Teacher ${suffix}`;
  const subjectName = `QA Parent Security Mathematics ${suffix}`;
  const termName = `${TERM_PREFIX} Spring ${suffix}`;
  const groupName = `${GROUP_PREFIX} Linked ${suffix}`;
  const foreignGroupName = `${FOREIGN_PREFIX} Group ${suffix}`;
  const lessonTitle = `${LESSON_PREFIX} Linked ${suffix}`;
  const foreignLessonTitle = `${FOREIGN_PREFIX} Lesson ${suffix}`;
  const assignmentTitle = `${ASSIGNMENT_PREFIX} Linked ${suffix}`;
  const foreignAssignmentTitle = `${FOREIGN_PREFIX} Assignment ${suffix}`;
  const materialTitle = `${MATERIAL_PREFIX} Linked ${suffix}`;
  const foreignMaterialTitle = `${FOREIGN_PREFIX} Material ${suffix}`;
  const manualTitle = `${MANUAL_PREFIX} Linked ${suffix}`;
  const progressText = `QA Parent Security progress linked ${suffix}`;
  const foreignProgressText = `${FOREIGN_PREFIX} progress ${suffix}`;
  const homeworkFeedback = `QA Parent Security feedback ${suffix}`;
  const reportComment = `QA Parent Security report comment ${suffix}`;
  const foreignReportComment = `${FOREIGN_PREFIX} report comment ${suffix}`;

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
        children: { connect: [] },
        email: `${USER_EMAIL_PREFIX}parent.${suffix}@example.com`,
        fullName: parentName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.PARENT,
      },
    }),
    prisma.subject.create({
      data: {
        description: "Parent security E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Parent security E2E level",
        name: `QA Parent Security Level ${suffix}`,
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

  await prisma.appUser.update({
    where: { id: parent.id },
    data: { children: { connect: { id: child.id } } },
  });

  const [group, foreignGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        levelId: level.id,
        name: groupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: { id: child.id } },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
    prisma.classGroup.create({
      data: {
        levelId: level.id,
        name: foreignGroupName,
        status: ClassGroupStatus.ACTIVE,
        students: { connect: { id: foreignChild.id } },
        subjectId: subject.id,
        teacherId: teacher.id,
      },
    }),
  ]);

  const [lesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: lessonEnd,
        startAt: lessonStart,
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: lessonTitle,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: foreignGroup.id,
        endAt: lessonEnd,
        startAt: lessonStart,
        status: LessonStatus.COMPLETED,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: foreignLessonTitle,
      },
    }),
  ]);

  const [assignment, foreignAssignment] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Linked read-only homework.",
        dueDate,
        scheduledClassId: lesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: assignmentTitle,
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Foreign homework.",
        dueDate,
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
        contentUrl: `/uploads/e2e/parent-security-${suffix}.pdf`,
        feedback: homeworkFeedback,
        grade: 92,
        studentId: child.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: foreignAssignment.id,
        contentUrl: `/uploads/e2e/parent-security-foreign-${suffix}.pdf`,
        feedback: "Foreign feedback should stay hidden",
        grade: 100,
        studentId: foreignChild.id,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Linked parent material.",
        fileUrl: `/uploads/e2e/parent-security-material-${suffix}.pdf`,
        scheduledClassId: lesson.id,
        teacherId: teacher.id,
        title: materialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Foreign parent material.",
        fileUrl: `/uploads/e2e/parent-security-foreign-material-${suffix}.pdf`,
        scheduledClassId: foreignLesson.id,
        teacherId: teacher.id,
        title: foreignMaterialTitle,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: lessonStart,
        markedById: teacher.id,
        reason: "Linked attendance reason",
        scheduledClassId: lesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: child.id,
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: lessonStart,
        markedById: teacher.id,
        reason: "Foreign attendance reason",
        scheduledClassId: foreignLesson.id,
        status: AttendanceStatus.ABSENT,
        studentId: foreignChild.id,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.GOOD,
        studentId: child.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: progressText,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.STRUGGLING,
        studentId: foreignChild.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: foreignProgressText,
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        classGroupId: group.id,
        description: "Linked manual grade.",
        gradedAt: lessonStart,
        score: 88,
        studentId: child.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: manualTitle,
      },
    }),
  ]);

  const snapshot = await prisma.reportSnapshot.create({
    data: {
      academicTermId: term.id,
      classGroupId: group.id,
      generatedByTeacherId: teacher.id,
      pdfGeneratedAt: new Date(),
      pdfStorageKey: `/uploads/reports/parent-security-${suffix}.pdf`,
      snapshotData: {
        academicTerm: { id: term.id, name: termName },
        attendance: { absent: 0, late: 0, present: 1 },
        attendanceHistory: [{ lessonTitle, status: "PRESENT" }],
        classGroup: { id: group.id, name: groupName },
        grades: {
          categories: [{ average: 90, label: "Homework", weight: 70 }],
          homeworkGrades: [{ feedback: homeworkFeedback, score: 92, title: assignmentTitle }],
          manualGrades: [{ description: "Linked manual grade.", score: 88, title: manualTitle }],
          weightedTermAverage: 90,
        },
        progressNotes: [{ content: progressText, performanceLevel: "GOOD" }],
        student: { email: child.email, fullName: childName, id: child.id },
        teacherComment: reportComment,
      },
      snapshotVersion: 1,
      studentId: child.id,
      teacherComment: reportComment,
    },
  });

  await prisma.reportSnapshot.create({
    data: {
      academicTermId: term.id,
      classGroupId: foreignGroup.id,
      generatedByTeacherId: teacher.id,
      snapshotData: {
        academicTerm: { id: term.id, name: termName },
        classGroup: { id: foreignGroup.id, name: foreignGroupName },
        grades: { weightedTermAverage: 100 },
        student: { email: foreignChild.email, fullName: foreignChildName, id: foreignChild.id },
        teacherComment: foreignReportComment,
      },
      snapshotVersion: 1,
      studentId: foreignChild.id,
      teacherComment: foreignReportComment,
    },
  });

  return {
    assignmentId: assignment.id,
    assignmentTitle,
    childId: child.id,
    childName,
    foreignAssignmentId: foreignAssignment.id,
    foreignAssignmentTitle,
    foreignChildId: foreignChild.id,
    foreignChildName,
    foreignLessonId: foreignLesson.id,
    foreignLessonTitle,
    foreignMaterialTitle,
    foreignProgressText,
    foreignReportComment,
    homeworkFeedback,
    lessonId: lesson.id,
    lessonTitle,
    manualTitle,
    materialTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    progressText,
    reportComment,
    snapshotId: snapshot.id,
    studentEmail: child.email,
    subjectName,
    teacherEmail: teacher.email,
    teacherId: teacher.id,
    teacherName,
    termName,
  };
}

async function cleanupFixtures() {
  await prisma.reportSnapshot.deleteMany({
    where: {
      OR: [
        { teacherComment: { startsWith: "QA Parent Security" } },
        { teacherComment: { startsWith: FOREIGN_PREFIX } },
      ],
    },
  });
  await prisma.manualGradeEntry.deleteMany({
    where: { title: { startsWith: MANUAL_PREFIX } },
  });
  await prisma.studentProgress.deleteMany({
    where: {
      OR: [
        { teacherNotes: { startsWith: "QA Parent Security progress" } },
        { teacherNotes: { startsWith: `${FOREIGN_PREFIX} progress` } },
      ],
    },
  });
  await prisma.attendanceRecord.deleteMany({
    where: {
      OR: [
        { reason: { startsWith: "Linked attendance" } },
        { reason: { startsWith: "Foreign attendance" } },
      ],
    },
  });
  await prisma.submission.deleteMany({
    where: { student: { email: { startsWith: USER_EMAIL_PREFIX } } },
  });
  await prisma.assignment.deleteMany({
    where: {
      OR: [{ title: { startsWith: ASSIGNMENT_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.courseMaterial.deleteMany({
    where: {
      OR: [{ title: { startsWith: MATERIAL_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.scheduledClass.deleteMany({
    where: {
      OR: [{ title: { startsWith: LESSON_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.classGroup.deleteMany({
    where: {
      OR: [{ name: { startsWith: GROUP_PREFIX } }, { name: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.academicTerm.deleteMany({ where: { name: { startsWith: TERM_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
