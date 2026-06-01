import { type BrowserContext, expect, test } from "@playwright/test";
import { StudentLearningStatus, UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
const USER_EMAIL_PREFIX = "qa.portal-side-effects.";
const CLASS_TITLE_PREFIX = "QA Portal Side Effects";

function testMeetUrl(path: string) {
  return `https://meet.example.com/${path}`;
}

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
  uid: string;
  role: UserRole;
  email: string;
  fullName: string;
}) {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      uid: input.uid,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      exp: Date.now() + 1000 * 60 * 60,
      mfaVerified: true,
      authMethod: "password",
    }),
  );
  return `${payloadBase64}.${await signPayload(payloadBase64)}`;
}

async function setPortalSession(
  context: BrowserContext,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
  },
) {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "ulu_session",
      value: await createSessionToken(input),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

async function cleanupTestData() {
  const users = await prisma.appUser.findMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const classes = await prisma.scheduledClass.findMany({
    where: { title: { startsWith: CLASS_TITLE_PREFIX } },
    select: { id: true },
  });
  const classIds = classes.map((scheduledClass) => scheduledClass.id);

  await prisma.submission.deleteMany({ where: { studentId: { in: userIds } } });
  await prisma.assignment.deleteMany({ where: { scheduledClassId: { in: classIds } } });
  await prisma.studentProgress.deleteMany({
    where: { OR: [{ studentId: { in: userIds } }, { teacherId: { in: userIds } }] },
  });
  await prisma.scheduledClass.deleteMany({ where: { id: { in: classIds } } });
  await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
}

test.describe("Parent and student portal side effects", () => {
  test.describe.configure({ timeout: 120000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  test("parent portal sees linked child and inactive student cannot log in", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashPassword(PASSWORD);
    const classTitle = `${CLASS_TITLE_PREFIX} Class ${suffix}`;
    const assignmentTitle = `${CLASS_TITLE_PREFIX} Assignment ${suffix}`;

    const [teacher, student, parent, subject] = await Promise.all([
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}teacher.${suffix}@example.com`,
          fullName: `QA Side Effects Teacher ${suffix}`,
          role: UserRole.TEACHER,
          passwordHash,
          isActive: true,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}student.${suffix}@example.com`,
          fullName: `QA Side Effects Student ${suffix}`,
          role: UserRole.STUDENT,
          passwordHash,
          isActive: true,
          learningStatus: StudentLearningStatus.ACTIVE,
        },
      }),
      prisma.appUser.create({
        data: {
          email: `${USER_EMAIL_PREFIX}parent.${suffix}@example.com`,
          fullName: `QA Side Effects Parent ${suffix}`,
          role: UserRole.PARENT,
          passwordHash,
          isActive: true,
        },
      }),
      prisma.subject.findFirstOrThrow({ where: { isActive: true } }),
    ]);

    const scheduledClass = await prisma.scheduledClass.create({
      data: {
        title: classTitle,
        description: "Verifies parent and student portal side effects.",
        startAt: new Date("2026-06-20T10:00:00.000Z"),
        endAt: new Date("2026-06-20T11:00:00.000Z"),
        liveLessonUrl: testMeetUrl("qa-portal-side-effects"),
        teacherId: teacher.id,
        students: { connect: { id: student.id } },
      },
    });
    await prisma.appUser.update({
      where: { id: parent.id },
      data: { children: { connect: { id: student.id } } },
    });
    const assignment = await prisma.assignment.create({
      data: {
        title: assignmentTitle,
        description: "Visible on the linked student portal.",
        dueDate: new Date("2026-06-21T10:00:00.000Z"),
        scheduledClassId: scheduledClass.id,
        teacherId: teacher.id,
        subjectId: subject.id,
      },
    });
    await prisma.submission.create({
      data: {
        studentId: student.id,
        assignmentId: assignment.id,
        contentUrl: "/uploads/qa-portal-side-effects.pdf",
        grade: 92,
        feedback: "Strong work",
      },
    });

    await setPortalSession(page.context(), {
      uid: parent.id,
      role: UserRole.PARENT,
      email: parent.email,
      fullName: parent.fullName,
    });
    await page.goto("/portal/parent");
    await expect(page.getByRole("heading", { name: "Parent Dashboard" })).toBeVisible();
    await expect(page.getByText(student.fullName)).toBeVisible();
    await expect(page.getByText(classTitle)).toBeVisible();
    await expect(page.getByText(teacher.fullName)).toBeVisible();
    const childDashboard = page.getByRole("region", {
      name: `Dashboard for ${student.fullName}`,
    });
    await expect(childDashboard.getByText(assignmentTitle, { exact: true })).toBeVisible();

    await setPortalSession(page.context(), {
      uid: student.id,
      role: UserRole.STUDENT,
      email: student.email,
      fullName: student.fullName,
    });
    await page.goto("/portal/schedule?month=2026-06");
    await expect(page.getByRole("heading", { name: "Class Calendar" })).toBeVisible();
    await expect(page.getByText(classTitle)).toBeVisible();

    await page.goto("/portal/student");
    await expect(page.getByText(assignmentTitle)).toBeVisible();
    await expect(page.getByText(classTitle, { exact: false })).toBeVisible();

    await prisma.appUser.update({
      where: { id: student.id },
      data: { isActive: false },
    });

    await page.context().clearCookies();
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(student.email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/portal\/login/);
  });
});
