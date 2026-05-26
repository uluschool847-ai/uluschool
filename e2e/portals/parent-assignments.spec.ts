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

const USER_EMAIL_PREFIX = "qa.parent-assignments.";
const ASSIGNMENT_PREFIX = "QA Parent Assignments Homework";
const FOREIGN_PREFIX = "QA Parent Assignments Foreign";
const GROUP_PREFIX = "QA Parent Assignments Group";
const LESSON_PREFIX = "QA Parent Assignments Lesson";
const MATERIAL_PREFIX = "QA Parent Assignments Material";
const SUBJECT_SLUG_PREFIX = "qa-parent-assignments-subject";
const LEVEL_SLUG_PREFIX = "qa-parent-assignments-level";
const SUBMITTED_WORK_HREF = "https://example.com/e2e-assets/parent-assignment-submitted-work";
const GRADED_WORK_HREF = "https://example.com/e2e-assets/parent-assignment-graded-work";

type ParentAssignmentsFixture = {
  activeAssignmentTitle: string;
  archivedAssignmentId: string;
  archivedAssignmentTitle: string;
  childId: string;
  childName: string;
  foreignAssignmentId: string;
  foreignAssignmentTitle: string;
  foreignChildId: string;
  gradedAssignmentId: string;
  gradedAssignmentTitle: string;
  groupName: string;
  materialTitle: string;
  missingAssignmentTitle: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  subjectName: string;
  submittedAssignmentTitle: string;
};

let fixture: ParentAssignmentsFixture;

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

function assignmentCard(page: Page, title: string) {
  return page.locator("article").filter({ hasText: title }).first();
}

test.describe("Parent assignments portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent lists and opens linked-child assignments read-only without seeing unlinked child work", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);
    await Promise.all([
      page.waitForURL(new RegExp(`/portal/parent/assignments/${fixture.childId}$`)),
      page.getByRole("link", { name: /open assignments/i }).click(),
    ]);

    await expect(page.getByRole("heading", { name: /assignments|homework/i })).toBeVisible();
    await expect(page.getByText(fixture.activeAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.missingAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.submittedAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.gradedAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.archivedAssignmentTitle)).toBeVisible();
    await expect(
      assignmentCard(page, fixture.missingAssignmentTitle).getByText(/missing/i),
    ).toBeVisible();
    await expect(
      assignmentCard(page, fixture.missingAssignmentTitle).getByText(/read-only|overdue|missing/i),
    ).toBeVisible();
    await expect(
      assignmentCard(page, fixture.gradedAssignmentTitle).getByText(/graded/i),
    ).toBeVisible();
    await expect(
      assignmentCard(page, fixture.gradedAssignmentTitle).getByText(/grade:\s*91/i),
    ).toBeVisible();
    await expect(
      assignmentCard(page, fixture.gradedAssignmentTitle).getByText(/excellent work/i),
    ).toBeVisible();
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        'input[name="grade"], textarea[name="feedback"], input[name="submissionUrl"], input[name="workLink"]',
      ),
    ).toHaveCount(0);

    await page.getByLabel(/status/i).selectOption("missing");
    await page.getByRole("button", { name: /apply|filter|show assignments/i }).click();
    await expect(page.getByText(fixture.missingAssignmentTitle)).toBeVisible();
    await expect(page.getByText(fixture.activeAssignmentTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/parent/assignments/${fixture.childId}`);
    await Promise.all([
      page.waitForURL(/\/portal\/parent\/assignments\/[^/]+\/[^/?]+$/),
      assignmentCard(page, fixture.gradedAssignmentTitle)
        .getByRole("link", { name: /view assignment|open assignment|details/i })
        .click(),
    ]);

    await expect(page.getByRole("heading", { name: fixture.gradedAssignmentTitle })).toBeVisible();
    await expect(page.getByText(fixture.subjectName)).toBeVisible();
    await expect(page.getByText(fixture.groupName)).toBeVisible();
    await expect(page.getByText(fixture.materialTitle)).toBeVisible();
    await expect(page.getByText(/submission history/i)).toBeVisible();
    await expect(page.getByText(/grade:\s*91/i)).toBeVisible();
    await expect(page.getByText(/excellent work/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /view work/i })).toHaveAttribute(
      "href",
      GRADED_WORK_HREF,
    );
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toHaveCount(0);
    await expect(
      page.locator(
        'input[name="grade"], textarea[name="feedback"], input[name="submissionUrl"], input[name="workLink"]',
      ),
    ).toHaveCount(0);

    await page.goto(
      `${BASE_URL}/portal/parent/assignments/${fixture.childId}/${fixture.archivedAssignmentId}`,
    );
    await expect(
      page.getByRole("heading", { name: fixture.archivedAssignmentTitle }),
    ).toBeVisible();
    await expect(
      page.locator("output").filter({
        hasText: /this assignment is archived\. read-only\./i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/parent/assignments/${fixture.foreignChildId}`);
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|not available|no assignments/i).first(),
    ).toBeVisible();

    await page.goto(
      `${BASE_URL}/portal/parent/assignments/${fixture.foreignChildId}/${fixture.foreignAssignmentId}`,
    );
    await expect(page.getByText(fixture.foreignAssignmentTitle)).toHaveCount(0);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|not available/i).first(),
    ).toBeVisible();
  });
});

async function createFixtures(): Promise<ParentAssignmentsFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
  const parentName = `QA Parent Assignments Parent ${suffix}`;
  const childName = `QA Parent Assignments Child ${suffix}`;
  const foreignChildName = `QA Parent Assignments Foreign Child ${suffix}`;
  const teacherName = `QA Parent Assignments Teacher ${suffix}`;
  const subjectName = `QA Parent Assignments Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} Linked ${suffix}`;
  const activeAssignmentTitle = `${ASSIGNMENT_PREFIX} Active ${suffix}`;
  const missingAssignmentTitle = `${ASSIGNMENT_PREFIX} Missing ${suffix}`;
  const submittedAssignmentTitle = `${ASSIGNMENT_PREFIX} Submitted ${suffix}`;
  const gradedAssignmentTitle = `${ASSIGNMENT_PREFIX} Graded ${suffix}`;
  const archivedAssignmentTitle = `${ASSIGNMENT_PREFIX} Archived ${suffix}`;
  const foreignAssignmentTitle = `${FOREIGN_PREFIX} Homework ${suffix}`;
  const materialTitle = `${MATERIAL_PREFIX} Algebra PDF ${suffix}`;

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
        description: "Parent assignments E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Parent assignments E2E level",
        name: `QA Parent Assignments Level ${suffix}`,
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
        timezone: "Europe/Kiev",
        title: `${LESSON_PREFIX} Direct ${suffix}`,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: group.id,
        endAt: new Date(futureEnd.getTime() + 60 * 60 * 1000),
        startAt: new Date(futureStart.getTime() + 60 * 60 * 1000),
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

  const [, , submittedAssignment, gradedAssignment, archivedAssignment, foreignAssignment] =
    await Promise.all([
      prisma.assignment.create({
        data: {
          description: "Active homework visible to the linked parent.",
          dueDate: new Date(futureStart.getTime() + 3 * 24 * 60 * 60 * 1000),
          scheduledClassId: directLesson.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          title: activeAssignmentTitle,
        },
      }),
      prisma.assignment.create({
        data: {
          description: "Missing homework visible read-only to the linked parent.",
          dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          scheduledClassId: directLesson.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          title: missingAssignmentTitle,
        },
      }),
      prisma.assignment.create({
        data: {
          description: "Submitted homework visible to the linked parent.",
          dueDate: new Date(futureStart.getTime() + 4 * 24 * 60 * 60 * 1000),
          scheduledClassId: groupLesson.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          title: submittedAssignmentTitle,
        },
      }),
      prisma.assignment.create({
        data: {
          description: "Graded homework with feedback visible to the linked parent.",
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
          description: "Archived homework is visible but read-only to the linked parent.",
          dueDate: new Date(futureStart.getTime() + 6 * 24 * 60 * 60 * 1000),
          scheduledClassId: groupLesson.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          title: archivedAssignmentTitle,
        },
      }),
      prisma.assignment.create({
        data: {
          description: "Foreign homework must stay hidden from this parent.",
          dueDate: new Date(futureStart.getTime() + 5 * 24 * 60 * 60 * 1000),
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
        description: "Parent assignment detail material.",
        fileUrl: "/uploads/materials/parent-assignment-algebra.pdf",
        scheduledClassId: groupLesson.id,
        teacherId: teacher.id,
        title: materialTitle,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: submittedAssignment.id,
        contentUrl: SUBMITTED_WORK_HREF,
        studentId: child.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: gradedAssignment.id,
        contentUrl: GRADED_WORK_HREF,
        feedback: "Excellent work. Check one final notation detail.",
        grade: 91,
        studentId: child.id,
      },
    }),
    prisma.submission.create({
      data: {
        assignmentId: foreignAssignment.id,
        contentUrl: `${BASE_URL}/e2e-assets/parent-assignment-foreign-work`,
        feedback: "Foreign feedback must stay hidden.",
        grade: 100,
        studentId: foreignChild.id,
      },
    }),
  ]);

  return {
    activeAssignmentTitle,
    archivedAssignmentId: archivedAssignment.id,
    archivedAssignmentTitle,
    childId: child.id,
    childName,
    foreignAssignmentId: foreignAssignment.id,
    foreignAssignmentTitle,
    foreignChildId: foreignChild.id,
    gradedAssignmentId: gradedAssignment.id,
    gradedAssignmentTitle,
    groupName,
    materialTitle,
    missingAssignmentTitle,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    subjectName,
    submittedAssignmentTitle,
  };
}

async function cleanupFixtures() {
  await prisma.submission.deleteMany({
    where: {
      OR: [
        { contentUrl: { contains: "parent-assignment" } },
        { assignment: { title: { startsWith: ASSIGNMENT_PREFIX } } },
        { assignment: { title: { startsWith: FOREIGN_PREFIX } } },
      ],
    },
  });
  await prisma.assignment.deleteMany({
    where: {
      OR: [{ title: { startsWith: ASSIGNMENT_PREFIX } }, { title: { startsWith: FOREIGN_PREFIX } }],
    },
  });
  await prisma.courseMaterial.deleteMany({ where: { title: { startsWith: MATERIAL_PREFIX } } });
  await prisma.scheduledClass.deleteMany({ where: { title: { startsWith: LESSON_PREFIX } } });
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
