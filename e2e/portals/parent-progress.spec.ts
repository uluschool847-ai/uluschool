import { type Page, expect, test } from "@playwright/test";
import { PerformanceLevel, PrismaClient, StudentLearningStatus, UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const USER_EMAIL_PREFIX = "qa.parent-progress.";
const SUBJECT_SLUG_PREFIX = "qa-parent-progress-subject";
const NOTE_PREFIX = "QA Parent Progress Note";

type ParentProgressFixture = {
  activeNoteContent: string;
  archivedNoteContent: string;
  childId: string;
  foreignChildId: string;
  foreignNoteContent: string;
  parentEmail: string;
  parentId: string;
  parentName: string;
  strugglingNoteContent: string;
  subjectName: string;
};

let fixture: ParentProgressFixture;

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

function progressCard(page: Page, noteText: string) {
  return page.locator("article").filter({ hasText: noteText }).first();
}

test.describe("Parent progress portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent reviews only linked-child progress history read-only with filters", async ({
    page,
  }) => {
    await setParentSession(page);
    await page.goto(`${BASE_URL}/portal/parent`);
    await Promise.all([
      page.waitForURL((url) =>
        `${url.pathname}${url.search}`.includes(`/portal/parent/progress/${fixture.childId}`),
      ),
      page.getByRole("link", { name: /open progress/i }).click(),
    ]);

    await expect(page.getByRole("heading", { name: /^progress$/i })).toBeVisible();
    await expect(page.getByText(fixture.activeNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.strugglingNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.archivedNoteContent)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignNoteContent)).toHaveCount(0);
    await expect(progressCard(page, fixture.activeNoteContent).getByText(/good/i)).toBeVisible();
    await expect(
      progressCard(page, fixture.activeNoteContent).getByText(fixture.subjectName),
    ).toBeVisible();
    await expect(
      page.locator(
        'button:has-text("Create"), button:has-text("Edit"), button:has-text("Archive")',
      ),
    ).toHaveCount(0);
    await expect(page.locator('button:has-text("Delete"), button:has-text("Save")')).toHaveCount(0);

    await page.locator('select[name="performanceLevel"]').selectOption(PerformanceLevel.GOOD);
    await page.getByRole("button", { name: /apply|filter|show progress/i }).click();
    await expect(page.getByText(fixture.activeNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.strugglingNoteContent)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignNoteContent)).toHaveCount(0);

    await page.locator('select[name="status"]').selectOption("archived");
    await page.locator('select[name="performanceLevel"]').selectOption("");
    await page.getByRole("button", { name: /apply|filter|show progress/i }).click();
    await expect(page.getByText(fixture.archivedNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.activeNoteContent)).toHaveCount(0);
    await expect(page.getByText(fixture.foreignNoteContent)).toHaveCount(0);

    await page.locator('select[name="status"]').selectOption("all");
    await page.getByLabel(/search/i).fill("struggling fractions");
    await page.getByRole("button", { name: /apply|filter|show progress/i }).click();
    await expect(page.getByText(fixture.strugglingNoteContent)).toBeVisible();
    await expect(page.getByText(fixture.activeNoteContent)).toHaveCount(0);
    await expect(page.getByText(fixture.archivedNoteContent)).toHaveCount(0);

    const response = await page.goto(
      `${BASE_URL}/portal/parent/progress/${fixture.foreignChildId}`,
    );
    expect([200, 404]).toContain(response?.status());
    await expect(page.getByText(fixture.foreignNoteContent)).toHaveCount(0);
  });
});

async function createFixtures(): Promise<ParentProgressFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentName = `QA Parent Progress Parent ${suffix}`;
  const childName = `QA Parent Progress Child ${suffix}`;
  const foreignChildName = `QA Parent Progress Foreign Child ${suffix}`;
  const teacherName = `QA Parent Progress Teacher ${suffix}`;
  const subjectName = `QA Parent Progress Mathematics ${suffix}`;
  const activeNoteContent = `${NOTE_PREFIX} Active algebra growth ${suffix}`;
  const strugglingNoteContent = `${NOTE_PREFIX} Struggling fractions review ${suffix}`;
  const archivedNoteContent = `${NOTE_PREFIX} Archived geometry growth ${suffix}`;
  const foreignNoteContent = `${NOTE_PREFIX} Foreign hidden note ${suffix}`;

  const [teacher, child, foreignChild, parent, subject] = await Promise.all([
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
        description: "Parent progress E2E subject",
        isActive: true,
        name: subjectName,
        slug: `${SUBJECT_SLUG_PREFIX}-${suffix}`,
      },
    }),
  ]);

  await prisma.appUser.update({
    where: { id: parent.id },
    data: { children: { connect: { id: child.id } } },
  });

  await Promise.all([
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.GOOD,
        studentId: child.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: activeNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.STRUGGLING,
        studentId: child.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: strugglingNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        archivedAt: new Date(),
        gradeLevel: PerformanceLevel.EXCELLENT,
        studentId: child.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: archivedNoteContent,
      },
    }),
    prisma.studentProgress.create({
      data: {
        gradeLevel: PerformanceLevel.EXCELLENT,
        studentId: foreignChild.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        teacherNotes: foreignNoteContent,
      },
    }),
  ]);

  return {
    activeNoteContent,
    archivedNoteContent,
    childId: child.id,
    foreignChildId: foreignChild.id,
    foreignNoteContent,
    parentEmail: parent.email,
    parentId: parent.id,
    parentName,
    strugglingNoteContent,
    subjectName,
  };
}

async function cleanupFixtures() {
  await prisma.studentProgress.deleteMany({
    where: { teacherNotes: { contains: NOTE_PREFIX } },
  });
  await prisma.subject.deleteMany({ where: { slug: { startsWith: SUBJECT_SLUG_PREFIX } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: USER_EMAIL_PREFIX } } });
}
