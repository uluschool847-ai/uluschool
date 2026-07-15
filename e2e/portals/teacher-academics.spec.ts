import { unlink } from "node:fs/promises";
import path from "node:path";
import { createSessionToken } from "@/e2e/helpers/session";
import { type Page, expect, test } from "@playwright/test";
import {
  AttendanceStatus,
  ClassGroupStatus,
  LessonStatus,
  NotificationType,
  PrismaClient,
  StudentLearningStatus,
  UserRole,
} from "@prisma/client";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const PREFIX = "qa.teacher-academics";
const GROUP_PREFIX = "QA Teacher Academics Group";
const LESSON_PREFIX = "QA Teacher Academics Lesson";
const MEETING_HOST = "meet.google.com";
const SUBJECT_SLUG_PREFIX = "qa-teacher-academics-subject";
const LEVEL_SLUG_PREFIX = "qa-teacher-academics-level";
const TERM_PREFIX = "QA Teacher Academics Term";
const generatedReportUploadKeys: string[] = [];
type Fixture = {
  activityReason: string;
  classGroupId: string;
  classGroupName: string;
  foreignSnapshotId: string;
  foreignStudentId: string;
  foreignStudentName: string;
  lessonTitle: string;
  notificationTitle: string;
  progressNote: string;
  reportSnapshotId: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  teacherEmail: string;
  teacherId: string;
  teacherName: string;
  termId: string;
  termName: string;
};

let fixture: Fixture;

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
        email: fixture.teacherEmail,
        fullName: fixture.teacherName,
        role: UserRole.TEACHER,
        uid: fixture.teacherId,
      }),
    },
  ]);
}

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localDateTimeInput(date: Date) {
  return date.toISOString().slice(0, 16);
}

function meetingHref(slug: string) {
  return ["https:", "", MEETING_HOST, slug].join("/");
}

test.describe("Teacher academics portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await cleanupGeneratedReportUploads();
    await prisma.$disconnect();
  });

  test("teacher can inspect scoped gradebook and report workflows", async ({ page }) => {
    await setPortalSession(page);

    await page.goto(`${BASE_URL}/portal/teacher/gradebook?termId=${fixture.termId}`);
    await expect(page.getByRole("heading", { name: /^gradebook$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: fixture.classGroupName })).toBeVisible();
    await expect(page.getByRole("link", { name: fixture.studentName })).toBeVisible();
    await expect(page.getByText(fixture.foreignStudentName)).toHaveCount(0);

    const classGroupGradebookLink = page.getByRole("link", { name: fixture.classGroupName });
    const classGroupGradebookHref = `/portal/teacher/gradebook/classes/${fixture.classGroupId}?termId=${fixture.termId}`;
    await expect(classGroupGradebookLink).toHaveAttribute("href", classGroupGradebookHref);
    await page.goto(`${BASE_URL}${classGroupGradebookHref}`);
    await expect(page).toHaveURL(/\/portal\/teacher\/gradebook\/classes\//);
    await expect(page.getByRole("heading", { name: /gradebook/i })).toBeVisible();
    await expect(page.getByText(fixture.classGroupName).first()).toBeVisible();
    await expect(page.getByText(/homework average:\s*88/i)).toBeVisible();
    await expect(page.getByText(/manual average:\s*92/i)).toBeVisible();
    await expect(page.getByText(/term average:\s*89\.2/i)).toBeVisible();
    await expect(page.getByText(fixture.foreignStudentName)).toHaveCount(0);

    await page.goto(
      `${BASE_URL}/portal/teacher/gradebook/students/${fixture.studentId}?termId=${fixture.termId}`,
    );
    await expect(page.getByRole("heading", { name: /gradebook/i })).toBeVisible();
    await expect(page.getByText(fixture.studentName).first()).toBeVisible();
    await expect(page.getByText(/term average:\s*89\.2/i)).toBeVisible();
    await expect(page.getByText("Homework score")).toBeVisible();
    await expect(page.getByText("88", { exact: true })).toBeVisible();
    await expect(page.getByText("Archived effort")).toBeVisible();
    await expect(page.getByText("70", { exact: true })).toBeVisible();

    const foreignGradebookResponse = await page.goto(
      `${BASE_URL}/portal/teacher/gradebook/students/${fixture.foreignStudentId}?termId=${fixture.termId}`,
    );
    expect(foreignGradebookResponse?.status()).toBe(404);
    await expect(page.getByText(fixture.foreignStudentName)).toHaveCount(0);

    await page.goto(
      `${BASE_URL}/portal/teacher/reports?search=${encodeURIComponent(
        fixture.studentName,
      )}&pdf=available&sort=average`,
    );
    await expect(page.getByRole("heading", { name: /^reports$/i })).toBeVisible();
    const reportRow = page.locator("li").filter({ hasText: fixture.studentName });
    await expect(reportRow).toBeVisible();
    await expect(reportRow).toContainText(fixture.classGroupName);
    await expect(reportRow).toContainText(fixture.termName);
    await expect(reportRow.getByText("PDF available", { exact: true })).toBeVisible();
    await expect(page.getByText(fixture.foreignStudentName)).toHaveCount(0);

    await reportRow.getByRole("link", { name: /view report/i }).click();
    await expect(page.getByRole("heading", { name: /saved report/i })).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(/consistent algebra reasoning/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /download pdf report/i })).toHaveAttribute(
      "href",
      "/uploads/reports/teacher-academics.pdf",
    );
    const pdfGeneratedAtBefore = await prisma.reportSnapshot.findUniqueOrThrow({
      where: { id: fixture.reportSnapshotId },
      select: { pdfGeneratedAt: true },
    });
    await page.getByRole("button", { name: /^export pdf$/i }).click();
    let exportedReportStorageKey: string | null = null;
    await expect
      .poll(async () => {
        const snapshot = await prisma.reportSnapshot.findUnique({
          where: { id: fixture.reportSnapshotId },
          select: { pdfGeneratedAt: true, pdfStorageKey: true },
        });
        exportedReportStorageKey = snapshot?.pdfStorageKey ?? null;
        return Boolean(
          snapshot?.pdfGeneratedAt &&
            pdfGeneratedAtBefore.pdfGeneratedAt &&
            snapshot.pdfGeneratedAt.getTime() > pdfGeneratedAtBefore.pdfGeneratedAt.getTime() &&
            exportedReportStorageKey,
        );
      })
      .toBe(true);
    expect(exportedReportStorageKey).toEqual(
      expect.stringMatching(new RegExp(`^private/teachers/${fixture.teacherId}/reports/.+\\.pdf$`)),
    );
    if (exportedReportStorageKey) {
      generatedReportUploadKeys.push(exportedReportStorageKey);
    }
    await expect
      .poll(async () =>
        prisma.adminAuditLog.count({
          where: {
            action: "REPORT_PDF_EXPORTED",
            actorId: fixture.teacherId,
            targetId: fixture.reportSnapshotId,
          },
        }),
      )
      .toBeGreaterThan(0);

    const foreignReportResponse = await page.goto(
      `${BASE_URL}/portal/teacher/reports/${fixture.foreignSnapshotId}`,
    );
    expect(foreignReportResponse?.status()).toBe(404);
    await expect(page.getByText(fixture.foreignStudentName)).toHaveCount(0);

    await page.goto(
      `${BASE_URL}/portal/teacher/reports/preview?studentId=${fixture.studentId}&termId=${fixture.termId}`,
    );
    await expect(page.getByRole("heading", { name: /report preview/i })).toBeVisible();
    await expect(page.locator("main > p").filter({ hasText: fixture.studentName })).toBeVisible();
    await expect(page.getByText(/weighted term average:\s*89\.2/i)).toBeVisible();
    await expect(page.getByText(/present:\s*1/i)).toBeVisible();
    await expect(page.getByText(fixture.progressNote)).toBeVisible();

    const savedReportComment = `Browser saved report ${Date.now()}`;
    await page.getByLabel(/teacher comment/i).fill(savedReportComment);
    await page.getByRole("button", { name: /save report snapshot/i }).click();
    await expect
      .poll(async () =>
        prisma.reportSnapshot.count({
          where: {
            academicTermId: fixture.termId,
            classGroupId: fixture.classGroupId,
            generatedByTeacherId: fixture.teacherId,
            studentId: fixture.studentId,
            teacherComment: savedReportComment,
          },
        }),
      )
      .toBe(1);
    const savedSnapshot = await prisma.reportSnapshot.findFirstOrThrow({
      where: {
        academicTermId: fixture.termId,
        classGroupId: fixture.classGroupId,
        generatedByTeacherId: fixture.teacherId,
        studentId: fixture.studentId,
        teacherComment: savedReportComment,
      },
      select: { id: true, snapshotData: true, snapshotVersion: true },
    });
    expect(JSON.stringify(savedSnapshot.snapshotData)).toContain(fixture.studentName);
    expect(savedSnapshot.snapshotVersion).toBe(1);
    await expect
      .poll(async () =>
        prisma.adminAuditLog.count({
          where: {
            action: "REPORT_SNAPSHOT_SAVED",
            actorId: fixture.teacherId,
            targetId: savedSnapshot.id,
          },
        }),
      )
      .toBeGreaterThan(0);
  });

  test("teacher can use availability and notifications without leaking foreign data", async ({
    page,
  }) => {
    await setPortalSession(page);

    await page.goto(
      `${BASE_URL}/portal/teacher/availability?teacherId=${fixture.foreignStudentId}`,
    );
    await expect(page.getByRole("heading", { name: /^availability$/i })).toBeVisible();
    await expect(page.getByText(/monday:\s*09:00 - 17:00/i)).toBeVisible();
    await expect(page.getByText("Existing blocked time")).toBeVisible();
    await expect(page.getByText("Foreign blocked time")).toHaveCount(0);

    const newStart = addMinutes(new Date(), 7 * 24 * 60);
    const newEnd = addMinutes(newStart, 90);
    await page.getByLabel(/^start$/i).fill(localDateTimeInput(newStart));
    await page.getByLabel(/^end$/i).fill(localDateTimeInput(newEnd));
    await page.getByLabel(/^reason$/i).fill("Browser-created blocked time");
    await page.getByRole("button", { name: /add unavailable period/i }).click();
    await expect(page).toHaveURL(/availabilityMessage=/);
    await expect(page.getByText("Browser-created blocked time")).toBeVisible();
    await expect
      .poll(async () => {
        const period = await prisma.teacherUnavailablePeriod.findFirst({
          where: { reason: "Browser-created blocked time" },
          select: { teacherId: true },
        });
        return period?.teacherId ?? null;
      })
      .toBe(fixture.teacherId);

    await page.goto(
      `${BASE_URL}/portal/teacher/notifications?status=unread&type=${NotificationType.LESSON_REMINDER}`,
    );
    await expect(page.getByRole("heading", { name: /teacher notifications/i })).toBeVisible();
    await expect(page.getByText(fixture.notificationTitle)).toBeVisible();
    await expect(page.getByText("Foreign notification")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /open related item/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );

    await page.getByRole("button", { name: /mark as read/i }).click();
    await expect
      .poll(async () => {
        const notification = await prisma.inAppNotification.findFirst({
          where: { recipientUserId: fixture.teacherId, title: fixture.notificationTitle },
          select: { readAt: true },
        });
        return Boolean(notification?.readAt);
      })
      .toBe(true);

    await page.goto(`${BASE_URL}/portal/teacher/notifications`);
    await page.getByLabel(/email reminders/i).uncheck();
    await page.getByLabel(/whatsapp reminders/i).check();
    await page.getByRole("button", { name: /save preferences/i }).click();
    await expect
      .poll(async () => {
        const preference = await prisma.notificationPreference.findUnique({
          where: { userId: fixture.teacherId },
          select: { emailEnabled: true, whatsappEnabled: true },
        });
        return `${preference?.emailEnabled}:${preference?.whatsappEnabled}`;
      })
      .toBe("false:true");
  });

  test("teacher activity log is scoped and hides raw audit JSON", async ({ page }) => {
    await setPortalSession(page);

    await page.goto(
      `${BASE_URL}/portal/teacher/activity?action=MANUAL_GRADE_CREATED&studentId=${fixture.studentId}&classGroupId=${fixture.classGroupId}`,
    );
    await expect(page.getByRole("heading", { name: /activity log/i })).toBeVisible();
    await expect(page.getByText(/manual grade created/i)).toBeVisible();
    await expect(page.getByText(fixture.studentName)).toBeVisible();
    await expect(page.getByText(fixture.classGroupName)).toBeVisible();
    await expect(page.getByText(fixture.lessonTitle)).toBeVisible();
    await expect(page.getByText(fixture.activityReason)).toBeVisible();
    await expect(page.getByText(/raw-before-private/i)).toHaveCount(0);
    await expect(page.getByText(/raw-meta-private/i)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/teacher/activity?studentId=${fixture.foreignStudentId}`);
    await expect(page.getByText(/no activity matches the selected filters/i)).toBeVisible();
    await expect(page.getByText(fixture.foreignStudentName)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const passwordHash = "test-password-hash";
  const teacherName = `QA Teacher Academics A ${suffix}`;
  const foreignTeacherName = `QA Teacher Academics B ${suffix}`;
  const studentName = `QA Teacher Academics Student ${suffix}`;
  const foreignStudentName = `QA Teacher Academics Foreign Student ${suffix}`;
  const subjectName = `QA Teacher Academics Mathematics ${suffix}`;
  const levelName = `QA Teacher Academics Level ${suffix}`;
  const classGroupName = `${GROUP_PREFIX} A ${suffix}`;
  const foreignClassGroupName = `${GROUP_PREFIX} B ${suffix}`;
  const lessonTitle = `${LESSON_PREFIX} Algebra ${suffix}`;
  const foreignLessonTitle = `${LESSON_PREFIX} Foreign ${suffix}`;
  const termName = `${TERM_PREFIX} ${suffix}`;
  const progressNote = `Strong algebra progress ${suffix}`;
  const activityReason = `Teacher added manual grade ${suffix}`;
  const notificationTitle = `Teacher reminder ${suffix}`;
  const termStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const termEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const [teacher, foreignTeacher, student, foreignStudent, subject, level, term] =
    await Promise.all([
      prisma.appUser.create({
        data: {
          email: `${PREFIX}.teacher-a.${suffix}@example.com`,
          fullName: teacherName,
          isActive: true,
          passwordHash,
          role: UserRole.TEACHER,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${PREFIX}.teacher-b.${suffix}@example.com`,
          fullName: foreignTeacherName,
          isActive: true,
          passwordHash,
          role: UserRole.TEACHER,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${PREFIX}.student.${suffix}@example.com`,
          fullName: studentName,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash,
          role: UserRole.STUDENT,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${PREFIX}.foreign-student.${suffix}@example.com`,
          fullName: foreignStudentName,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
          passwordHash,
          role: UserRole.STUDENT,
        },
      }),
      prisma.subject.create({
        data: {
          description: "Subject fixture for teacher academics E2E.",
          isActive: true,
          name: subjectName,
          priority: 89,
          slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
        },
      }),
      prisma.level.create({
        data: {
          description: "Level fixture for teacher academics E2E.",
          name: levelName,
          slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
        },
      }),
      prisma.academicTerm.create({
        data: {
          endDate: termEnd,
          isActive: true,
          name: termName,
          startDate: termStart,
        },
      }),
    ]);

  const [classGroup, foreignClassGroup] = await Promise.all([
    prisma.classGroup.create({
      data: {
        capacity: 12,
        description: "Teacher academics class group.",
        endDate: termEnd,
        levelId: level.id,
        name: classGroupName,
        startDate: termStart,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: teacher.id,
        students: { connect: { id: student.id } },
      },
    }),
    prisma.classGroup.create({
      data: {
        capacity: 12,
        description: "Foreign teacher academics class group.",
        endDate: termEnd,
        levelId: level.id,
        name: foreignClassGroupName,
        startDate: termStart,
        status: ClassGroupStatus.ACTIVE,
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
        students: { connect: { id: foreignStudent.id } },
      },
    }),
  ]);

  const [lesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: classGroup.id,
        description: "Teacher academics lesson.",
        endAt: addMinutes(now, 90),
        liveLessonUrl: meetingHref("teacher-academics"),
        status: LessonStatus.SCHEDULED,
        students: { connect: { id: student.id } },
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Africa/Nairobi",
        title: lessonTitle,
        startAt: addMinutes(now, 30),
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: foreignClassGroup.id,
        description: "Foreign teacher academics lesson.",
        endAt: addMinutes(now, 90),
        liveLessonUrl: meetingHref("teacher-academics-foreign"),
        status: LessonStatus.SCHEDULED,
        students: { connect: { id: foreignStudent.id } },
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
        timezone: "Africa/Nairobi",
        title: foreignLessonTitle,
        startAt: addMinutes(now, 30),
      },
    }),
  ]);

  const [assignment, foreignAssignment] = await Promise.all([
    prisma.assignment.create({
      data: {
        description: "Graded homework.",
        dueDate: addMinutes(now, 24 * 60),
        scheduledClassId: lesson.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: "Homework score",
      },
    }),
    prisma.assignment.create({
      data: {
        description: "Foreign graded homework.",
        dueDate: addMinutes(now, 24 * 60),
        scheduledClassId: foreignLesson.id,
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
        title: "Foreign homework score",
      },
    }),
  ]);

  await Promise.all([
    prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        contentUrl: "/uploads/teacher-academics.pdf",
        feedback: "Good homework solution.",
        grade: 88,
        studentId: student.id,
        submittedAt: addMinutes(termStart, 24 * 60),
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: foreignAssignment.id,
        contentUrl: "/uploads/teacher-academics-foreign.pdf",
        feedback: "Foreign homework solution.",
        grade: 99,
        studentId: foreignStudent.id,
        submittedAt: addMinutes(termStart, 24 * 60),
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        classGroupId: classGroup.id,
        description: "Active manual grade.",
        gradedAt: addMinutes(termStart, 24 * 60),
        score: 92,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: "Manual score",
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        archivedAt: addMinutes(termStart, 24 * 60),
        classGroupId: classGroup.id,
        description: "Archived manual grade.",
        gradedAt: addMinutes(termStart, 24 * 60),
        score: 70,
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: "Archived effort",
      },
    }),
    prisma.manualGradeEntry.create({
      data: {
        academicTermId: term.id,
        classGroupId: foreignClassGroup.id,
        description: "Foreign manual grade.",
        gradedAt: addMinutes(termStart, 24 * 60),
        score: 99,
        studentId: foreignStudent.id,
        subjectId: subject.id,
        teacherId: foreignTeacher.id,
        title: "Foreign manual score",
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        markedAt: addMinutes(termStart, 24 * 60),
        markedById: teacher.id,
        scheduledClassId: lesson.id,
        status: AttendanceStatus.PRESENT,
        studentId: student.id,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: "GOOD",
        recordedAt: addMinutes(termStart, 24 * 60),
        studentId: student.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: progressNote,
      },
    }),
    prisma.teacherAvailabilityRule.create({
      data: {
        endTime: "17:00",
        startTime: "09:00",
        status: "ACTIVE",
        teacherId: teacher.id,
        timezone: "Africa/Nairobi",
        weekday: 1,
      },
    }),
    prisma.teacherUnavailablePeriod.create({
      data: {
        endAt: addMinutes(now, 4 * 24 * 60 + 60),
        reason: "Existing blocked time",
        startAt: addMinutes(now, 4 * 24 * 60),
        teacherId: teacher.id,
      },
    }),
    prisma.teacherUnavailablePeriod.create({
      data: {
        endAt: addMinutes(now, 4 * 24 * 60 + 60),
        reason: "Foreign blocked time",
        startAt: addMinutes(now, 4 * 24 * 60),
        teacherId: foreignTeacher.id,
      },
    }),
    prisma.inAppNotification.create({
      data: {
        body: "The next lesson starts soon.",
        dedupeKey: `${PREFIX}.notification.${suffix}`,
        deliveryStatus: "SENT",
        details: classGroupName,
        recipientUserId: teacher.id,
        relatedHref: "/portal/teacher/schedule",
        title: notificationTitle,
        type: NotificationType.LESSON_REMINDER,
      },
    }),
    prisma.inAppNotification.create({
      data: {
        body: "Foreign notification body.",
        dedupeKey: `${PREFIX}.foreign-notification.${suffix}`,
        deliveryStatus: "SENT",
        details: foreignClassGroupName,
        recipientUserId: foreignTeacher.id,
        relatedHref: "/portal/teacher/schedule",
        title: "Foreign notification",
        type: NotificationType.LESSON_REMINDER,
      },
    }),
    prisma.notificationPreference.create({
      data: {
        emailEnabled: true,
        userId: teacher.id,
        whatsappEnabled: false,
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "MANUAL_GRADE_CREATED",
        actorEmail: teacher.email,
        actorFullName: teacher.fullName,
        actorId: teacher.id,
        actorRole: UserRole.TEACHER,
        adminUserId: teacher.id,
        after: { score: 92, hiddenValue: "raw-after-private" },
        before: { hiddenValue: "raw-before-private" },
        meta: {
          classGroupId: classGroup.id,
          classGroupName,
          lessonTitle,
          rawHiddenValue: "raw-meta-private",
          reason: activityReason,
          studentId: student.id,
          studentName,
        },
        targetId: student.id,
        targetType: "manualGrade",
      },
    }),
    prisma.adminAuditLog.create({
      data: {
        action: "MANUAL_GRADE_CREATED",
        actorEmail: foreignTeacher.email,
        actorFullName: foreignTeacher.fullName,
        actorId: foreignTeacher.id,
        actorRole: UserRole.TEACHER,
        adminUserId: foreignTeacher.id,
        meta: {
          classGroupId: foreignClassGroup.id,
          classGroupName: foreignClassGroupName,
          studentId: foreignStudent.id,
          studentName: foreignStudentName,
        },
        targetId: foreignStudent.id,
        targetType: "manualGrade",
      },
    }),
  ]);

  const reportSnapshot = await prisma.reportSnapshot.create({
    data: {
      academicTermId: term.id,
      classGroupId: classGroup.id,
      generatedAt: addMinutes(now, -30),
      generatedByTeacherId: teacher.id,
      pdfGeneratedAt: addMinutes(now, -20),
      pdfStorageKey: "reports/teacher-academics.pdf",
      snapshotData: {
        academicTerm: { id: term.id, name: term.name },
        classGroup: { id: classGroup.id, name: classGroup.name },
        grades: { weightedTermAverage: 89.2 },
        student: { email: student.email, fullName: student.fullName, id: student.id },
        teacherComment: "Consistent algebra reasoning.",
      },
      snapshotVersion: 1,
      studentId: student.id,
      teacherComment: "Consistent algebra reasoning.",
    },
  });
  const foreignSnapshot = await prisma.reportSnapshot.create({
    data: {
      academicTermId: term.id,
      classGroupId: foreignClassGroup.id,
      generatedAt: addMinutes(now, -30),
      generatedByTeacherId: foreignTeacher.id,
      snapshotData: {
        academicTerm: { id: term.id, name: term.name },
        classGroup: { id: foreignClassGroup.id, name: foreignClassGroup.name },
        grades: { weightedTermAverage: 99 },
        student: {
          email: foreignStudent.email,
          fullName: foreignStudent.fullName,
          id: foreignStudent.id,
        },
      },
      snapshotVersion: 1,
      studentId: foreignStudent.id,
      teacherComment: "Foreign report comment.",
    },
  });

  return {
    activityReason,
    classGroupId: classGroup.id,
    classGroupName,
    foreignSnapshotId: foreignSnapshot.id,
    foreignStudentId: foreignStudent.id,
    foreignStudentName,
    lessonTitle,
    notificationTitle,
    progressNote,
    reportSnapshotId: reportSnapshot.id,
    studentId: student.id,
    studentName,
    subjectName,
    teacherEmail: teacher.email,
    teacherId: teacher.id,
    teacherName,
    termId: term.id,
    termName,
  };
}

async function cleanupGeneratedReportUploads() {
  const uploadRoots = [
    path.resolve(process.cwd(), ".data", "uploads"),
    path.resolve(process.cwd(), "public", "uploads"),
  ];
  for (const key of new Set(generatedReportUploadKeys)) {
    const relative = key
      .replace(/^\/+/, "")
      .replace(/^public[\\/]/, "")
      .replace(/^uploads[\\/]?/, "");
    for (const uploadRoot of uploadRoots) {
      const absolutePath = path.resolve(uploadRoot, relative);
      if (absolutePath === uploadRoot || !absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
        continue;
      }
      await unlink(absolutePath).catch(() => undefined);
    }
  }
}

function isTransientDatabaseError(error: unknown) {
  return (
    error instanceof Error &&
    /server has closed the connection|connection.*closed/i.test(error.message)
  );
}

async function cleanupFixtures() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await cleanupFixturesOnce();
      return;
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt === 3) throw error;
      await prisma.$disconnect();
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function cleanupFixturesOnce() {
  const users = await prisma.appUser.findMany({
    select: { id: true },
    where: { email: { startsWith: PREFIX } },
  });
  const userIds = users.map((user) => user.id);
  const groups = await prisma.classGroup.findMany({
    select: { id: true },
    where: { name: { startsWith: GROUP_PREFIX } },
  });
  const groupIds = groups.map((group) => group.id);
  const lessons = await prisma.scheduledClass.findMany({
    select: { id: true },
    where: {
      OR: [{ title: { startsWith: LESSON_PREFIX } }, { classGroupId: { in: groupIds } }],
    },
  });
  const lessonIds = lessons.map((lesson) => lesson.id);
  const assignments = await prisma.assignment.findMany({
    select: { id: true },
    where: { scheduledClassId: { in: lessonIds } },
  });
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const subjects = await prisma.subject.findMany({
    select: { id: true },
    where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } },
  });
  const subjectIds = subjects.map((subject) => subject.id);
  const terms = await prisma.academicTerm.findMany({
    select: { id: true },
    where: { name: { startsWith: TERM_PREFIX } },
  });
  const termIds = terms.map((term) => term.id);

  await prisma.adminAuditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { adminUserId: { in: userIds } },
        { targetId: { in: [...userIds, ...groupIds, ...lessonIds] } },
      ],
    },
  });
  await prisma.inAppNotification.deleteMany({ where: { recipientUserId: { in: userIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.reportSnapshot.deleteMany({
    where: {
      OR: [
        { generatedByTeacherId: { in: userIds } },
        { studentId: { in: userIds } },
        { classGroupId: { in: groupIds } },
        { academicTermId: { in: termIds } },
      ],
    },
  });
  await prisma.studentProgress.deleteMany({
    where: {
      OR: [
        { studentId: { in: userIds } },
        { teacherId: { in: userIds } },
        { subjectId: { in: subjectIds } },
      ],
    },
  });
  await prisma.attendanceRecord.deleteMany({
    where: {
      OR: [
        { markedById: { in: userIds } },
        { studentId: { in: userIds } },
        { scheduledClassId: { in: lessonIds } },
      ],
    },
  });
  await prisma.manualGradeEntry.deleteMany({
    where: {
      OR: [
        { teacherId: { in: userIds } },
        { studentId: { in: userIds } },
        { classGroupId: { in: groupIds } },
        { academicTermId: { in: termIds } },
      ],
    },
  });
  await prisma.submission.deleteMany({
    where: {
      OR: [{ assignmentId: { in: assignmentIds } }, { studentId: { in: userIds } }],
    },
  });
  await prisma.assignment.deleteMany({
    where: { OR: [{ id: { in: assignmentIds } }, { scheduledClassId: { in: lessonIds } }] },
  });
  await prisma.courseMaterial.deleteMany({ where: { scheduledClassId: { in: lessonIds } } });
  await prisma.scheduledClass.deleteMany({ where: { id: { in: lessonIds } } });
  await prisma.teacherUnavailablePeriod.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.teacherAvailabilityRule.deleteMany({ where: { teacherId: { in: userIds } } });

  for (const group of groups) {
    await prisma.classGroup.update({
      data: { students: { set: [] } },
      where: { id: group.id },
    });
  }

  await prisma.classGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.academicTerm.deleteMany({ where: { id: { in: termIds } } });
  await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
}
