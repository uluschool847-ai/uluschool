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
const SAFE_MATERIAL_URL = `${BASE_URL}/e2e-assets/student-material-safe.pdf`;

const USER_EMAIL_PREFIX = "qa.student-materials.";
const LESSON_PREFIX = "QA Student Materials Lesson";
const GROUP_PREFIX = "QA Student Materials Group";
const MATERIAL_PREFIX = "QA Student Materials Resource";
const SUBJECT_SLUG_PREFIX = "qa-student-materials-subject";
const LEVEL_SLUG_PREFIX = "qa-student-materials-level";

type StudentMaterialsFixture = {
  directLessonId: string;
  directLessonTitle: string;
  directMaterialTitle: string;
  foreignMaterialTitle: string;
  groupMaterialTitle: string;
  groupName: string;
  studentEmail: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  unsafeMaterialTitle: string;
};

let fixture: StudentMaterialsFixture;

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

function materialCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

test.describe("Student materials portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student can list, filter, and open only their safe course materials", async ({ page }) => {
    await setStudentSession(page);
    await page.goto(`${BASE_URL}/portal/student/materials`);

    await expect(page.getByRole("heading", { name: /^materials$/i })).toBeVisible();
    await expect(page.getByText(fixture.directMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.groupMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignMaterialTitle)).toHaveCount(0);

    await page.getByLabel(/search/i).fill("Direct");
    await page.getByRole("button", { name: /apply|filter|show materials/i }).click();
    await expect(page.getByText(fixture.directMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.groupMaterialTitle)).toHaveCount(0);

    await page.getByLabel(/search/i).fill("");
    await page.getByLabel(/class group/i).fill(fixture.groupName);
    await page.getByRole("button", { name: /apply|filter|show materials/i }).click();
    await expect(page.getByText(fixture.groupMaterialTitle)).toBeVisible();

    const safeLink = materialCard(page, fixture.directMaterialTitle).getByRole("link", {
      name: /open material|view file|download/i,
    });
    await expect(safeLink).toHaveAttribute("href", SAFE_MATERIAL_URL);

    await page.goto(`${BASE_URL}/portal/student/schedule/${fixture.directLessonId}`);
    await expect(page.getByRole("heading", { name: fixture.directLessonTitle })).toBeVisible();
    await expect(page.getByRole("link", { name: fixture.directMaterialTitle })).toHaveAttribute(
      "href",
      SAFE_MATERIAL_URL,
    );
    await expect(page.getByRole("link", { name: /view all materials/i })).toHaveAttribute(
      "href",
      `/portal/student/materials?scheduledClassId=${fixture.directLessonId}`,
    );

    await page.goto(`${BASE_URL}/portal/student/materials`);
    await expect(page.getByText(fixture.unsafeMaterialTitle)).toBeVisible();
    await expect(
      materialCard(page, fixture.unsafeMaterialTitle).getByRole("link", {
        name: /open material|view file|download/i,
      }),
    ).toHaveCount(0);
  });
});

async function createFixtures(): Promise<StudentMaterialsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const studentName = `QA Student Materials Student ${suffix}`;
  const foreignStudentName = `QA Student Materials Foreign Student ${suffix}`;
  const teacherName = `QA Student Materials Teacher ${suffix}`;
  const subjectName = `QA Student Materials Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} A ${suffix}`;
  const directLessonTitle = `${LESSON_PREFIX} Direct ${suffix}`;
  const directMaterialTitle = `${MATERIAL_PREFIX} Direct ${suffix}`;
  const groupMaterialTitle = `${MATERIAL_PREFIX} Group ${suffix}`;
  const unsafeMaterialTitle = `${MATERIAL_PREFIX} Unsafe ${suffix}`;
  const foreignMaterialTitle = `${MATERIAL_PREFIX} Foreign ${suffix}`;

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
        description: "Student materials E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Student materials E2E level",
        name: `QA Student Materials Level ${suffix}`,
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
        name: `${GROUP_PREFIX} Foreign ${suffix}`,
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
        timezone: "Africa/Nairobi",
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
        timezone: "Africa/Nairobi",
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
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} Foreign ${suffix}`,
      },
    }),
  ]);

  await Promise.all([
    prisma.courseMaterial.create({
      data: {
        description: "Direct enrollment safe material.",
        fileUrl: SAFE_MATERIAL_URL,
        scheduledClassId: directLesson.id,
        teacherId: teacher.id,
        title: directMaterialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Class group enrollment material.",
        fileUrl: "/uploads/e2e/student-material-group.pdf",
        scheduledClassId: groupLesson.id,
        teacherId: teacher.id,
        title: groupMaterialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Unsafe material should render without an active link.",
        fileUrl: "javascript:alert(1)",
        scheduledClassId: directLesson.id,
        teacherId: teacher.id,
        title: unsafeMaterialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Foreign material should stay hidden.",
        fileUrl: "/uploads/e2e/student-material-foreign.pdf",
        scheduledClassId: foreignLesson.id,
        teacherId: teacher.id,
        title: foreignMaterialTitle,
      },
    }),
  ]);

  return {
    directLessonId: directLesson.id,
    directLessonTitle,
    directMaterialTitle,
    foreignMaterialTitle,
    groupMaterialTitle,
    groupName,
    studentEmail: student.email,
    studentId: student.id,
    studentName,
    subjectName,
    unsafeMaterialTitle,
  };
}

async function cleanupFixtures() {
  await prisma.courseMaterial.deleteMany({
    where: { title: { contains: MATERIAL_PREFIX } },
  });
  await prisma.scheduledClass.deleteMany({ where: { title: { contains: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { contains: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
