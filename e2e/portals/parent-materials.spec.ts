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

const HTTPS_MATERIAL_HREF = "https://example.com/e2e-assets/parent-material-safe.pdf";
const HTTPS_MATERIAL_ATTACHMENT_HREF = "/uploads/e2e/parent-material-https-attachment.pdf";
const UPLOAD_MATERIAL_URL = "/uploads/e2e/parent-material-upload.pdf";
const USER_EMAIL_PREFIX = "qa.parent-materials.";
const GROUP_PREFIX = "QA Parent Materials Group";
const LESSON_PREFIX = "QA Parent Materials Lesson";
const MATERIAL_PREFIX = "QA Parent Materials Resource";
const SUBJECT_SLUG_PREFIX = "qa-parent-materials-subject";
const LEVEL_SLUG_PREFIX = "qa-parent-materials-level";

type ParentMaterialsFixture = {
  childId: string;
  childName: string;
  directLessonTitle: string;
  foreignChildId: string;
  foreignMaterialTitle: string;
  groupMaterialTitle: string;
  groupName: string;
  httpsMaterialTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  subjectName: string;
  uploadMaterialTitle: string;
  unsafeMaterialTitle: string;
};

let fixture: ParentMaterialsFixture;

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

function materialCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

test.describe("Parent materials portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent lists linked-child materials read-only without seeing unlinked child materials", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);
    await Promise.all([
      page.waitForURL((url) =>
        `${url.pathname}${url.search}`.includes(`/portal/parent/materials/${fixture.childId}`),
      ),
      page.getByRole("link", { name: /open materials/i }).click(),
    ]);

    await expect(page.getByRole("heading", { name: /materials/i })).toBeVisible();
    await expect(page.getByText(fixture.httpsMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.uploadMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.groupMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.unsafeMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignMaterialTitle)).toHaveCount(0);

    await expect(
      materialCard(page, fixture.httpsMaterialTitle).getByRole("link", {
        name: /open material|view file|download/i,
      }),
    ).toHaveAttribute("href", HTTPS_MATERIAL_ATTACHMENT_HREF);
    await expect(
      materialCard(page, fixture.uploadMaterialTitle).getByRole("link", {
        name: /open material|view file|download/i,
      }),
    ).toHaveAttribute("href", UPLOAD_MATERIAL_URL);
    await expect(
      materialCard(page, fixture.unsafeMaterialTitle).getByRole("link", {
        name: /open material|view file|download/i,
      }),
    ).toHaveCount(0);

    await expect(
      page.locator('button:has-text("Upload"), button:has-text("Create"), button:has-text("Edit")'),
    ).toHaveCount(0);
    await expect(
      page.locator('button:has-text("Delete"), button:has-text("Unlink"), button:has-text("Save")'),
    ).toHaveCount(0);

    await page.getByLabel(/search/i).fill("HTTPS");
    await page.getByRole("button", { name: /apply|filter|show materials/i }).click();
    await expect(page.getByText(fixture.httpsMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.uploadMaterialTitle)).toHaveCount(0);

    await page.getByLabel(/search/i).fill("");
    await page.getByLabel(/class group/i).fill(fixture.groupName);
    await page.getByRole("button", { name: /apply|filter|show materials/i }).click();
    await expect(page.getByText(fixture.groupMaterialTitle)).toBeVisible();
    await expect(page.getByText(fixture.foreignMaterialTitle)).toHaveCount(0);

    const response = await page.goto(
      `${BASE_URL}/portal/parent/materials/${fixture.foreignChildId}`,
    );
    expect([200, 404]).toContain(response?.status());
    await expect(page.getByText(fixture.foreignMaterialTitle)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<ParentMaterialsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const parentName = `QA Parent Materials Parent ${suffix}`;
  const childName = `QA Parent Materials Child ${suffix}`;
  const foreignChildName = `QA Parent Materials Foreign Child ${suffix}`;
  const teacherName = `QA Parent Materials Teacher ${suffix}`;
  const subjectName = `QA Parent Materials Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} Linked ${suffix}`;
  const httpsMaterialTitle = `${MATERIAL_PREFIX} HTTPS ${suffix}`;
  const uploadMaterialTitle = `${MATERIAL_PREFIX} Upload ${suffix}`;
  const groupMaterialTitle = `${MATERIAL_PREFIX} Group ${suffix}`;
  const unsafeMaterialTitle = `${MATERIAL_PREFIX} Unsafe ${suffix}`;
  const foreignMaterialTitle = `${MATERIAL_PREFIX} Foreign ${suffix}`;

  const [teacher, child, foreignChild, parent, subject, level] = await Promise.all([
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
        description: "Parent materials E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Parent materials E2E level",
        name: `QA Parent Materials Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
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
        name: groupName,
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

  const [directLesson, groupLesson, foreignLesson] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        endAt: futureEnd,
        startAt: futureStart,
        status: LessonStatus.SCHEDULED,
        students: { connect: [{ id: child.id }] },
        subjectId: subject.id,
        teacherId: teacher.id,
        timezone: "Africa/Nairobi",
        title: `${LESSON_PREFIX} Direct ${suffix}`,
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
        attachments: {
          create: {
            filename: "parent-material-https-attachment.pdf",
            mimeType: "application/pdf",
            size: 1024,
            storageKey: "uploads/e2e/parent-material-https-attachment.pdf",
          },
        },
        description: "Safe HTTPS material visible to the linked parent.",
        fileUrl: HTTPS_MATERIAL_HREF,
        scheduledClassId: directLesson.id,
        teacherId: teacher.id,
        title: httpsMaterialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Safe upload material visible to the linked parent.",
        fileUrl: UPLOAD_MATERIAL_URL,
        scheduledClassId: directLesson.id,
        teacherId: teacher.id,
        title: uploadMaterialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Class group material visible to the linked parent.",
        fileUrl: "/uploads/e2e/parent-material-group.pdf",
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
        description: "Foreign material should stay hidden from this parent.",
        fileUrl: "/uploads/e2e/parent-material-foreign.pdf",
        scheduledClassId: foreignLesson.id,
        teacherId: teacher.id,
        title: foreignMaterialTitle,
      },
    }),
  ]);

  return {
    childId: child.id,
    childName,
    directLessonTitle: directLesson.title,
    foreignChildId: foreignChild.id,
    foreignMaterialTitle,
    groupMaterialTitle,
    groupName,
    httpsMaterialTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    subjectName,
    uploadMaterialTitle,
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
