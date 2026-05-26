import { type Page, expect, test } from "@playwright/test";
import { ClassGroupStatus, PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.parent-profile.";
const GROUP_PREFIX = "QA Parent Profile Group";
const SUBJECT_SLUG_PREFIX = "qa-parent-profile-subject";
const LEVEL_SLUG_PREFIX = "qa-parent-profile-level";

type ParentProfileFixture = {
  childName: string;
  foreignChildName: string;
  groupName: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  subjectName: string;
};

let fixture: ParentProfileFixture;

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

test.describe("Parent profile portal", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent opens profile from dashboard and sees only current parent linked children", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);

    await expect(page.getByRole("link", { name: /open profile/i })).toHaveAttribute(
      "href",
      "/portal/parent/profile",
    );

    await Promise.all([
      page.waitForURL("**/portal/parent/profile"),
      page.getByRole("link", { name: /open profile/i }).click(),
    ]);

    await expect(page.getByRole("heading", { name: /parent profile/i })).toBeVisible();
    const identity = page.getByRole("region", { name: /parent identity/i });
    await expect(identity.getByText(fixture.parentName)).toBeVisible();
    await expect(identity.getByText(fixture.parentEmail)).toBeVisible();
    await expect(identity.getByText(/^Guardian$/i)).toBeVisible();
    await expect(identity.getByText(/active/i)).toBeVisible();
    await expect(page.getByText(fixture.childName)).toBeVisible();
    await expect(page.getByText(fixture.groupName)).toBeVisible();
    await expect(page.getByText(fixture.subjectName)).toBeVisible();
    await expect(page.getByText(fixture.foreignChildName)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /back to parent dashboard/i })).toHaveAttribute(
      "href",
      "/portal/parent",
    );
    await expect(
      page.getByRole("button", { name: /edit|save|change password|password|email|role|link/i }),
    ).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/parent/profile?parentId=foreign-parent`);
    await expect(
      page.getByRole("region", { name: /parent identity/i }).getByText(fixture.parentName),
    ).toBeVisible();
    await expect(page.getByText(fixture.foreignChildName)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<ParentProfileFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentName = `QA Parent Profile Parent ${suffix}`;
  const childName = `QA Parent Profile Child ${suffix}`;
  const foreignChildName = `QA Parent Profile Foreign Child ${suffix}`;
  const teacherName = `QA Parent Profile Teacher ${suffix}`;
  const subjectName = `QA Parent Profile Mathematics ${suffix}`;
  const groupName = `${GROUP_PREFIX} Linked ${suffix}`;

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
        description: "Parent profile E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
    prisma.level.create({
      data: {
        description: "Parent profile E2E level",
        name: `QA Parent Profile Level ${suffix}`,
        slug: `${LEVEL_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  await prisma.appUser.update({
    data: { children: { connect: { id: child.id } } },
    where: { id: parent.id },
  });

  await prisma.classGroup.create({
    data: {
      capacity: 12,
      levelId: level.id,
      name: groupName,
      status: ClassGroupStatus.ACTIVE,
      students: { connect: [{ id: child.id }] },
      subjectId: subject.id,
      teacherId: teacher.id,
    },
  });

  await prisma.classGroup.create({
    data: {
      capacity: 12,
      levelId: level.id,
      name: `${GROUP_PREFIX} Foreign ${suffix}`,
      status: ClassGroupStatus.ACTIVE,
      students: { connect: [{ id: foreignChild.id }] },
      subjectId: subject.id,
      teacherId: teacher.id,
    },
  });

  return {
    childName,
    foreignChildName,
    groupName,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    subjectName,
  };
}

async function cleanupFixtures() {
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: GROUP_PREFIX } } });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.level.deleteMany({ where: { slug: { startsWith: LEVEL_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
