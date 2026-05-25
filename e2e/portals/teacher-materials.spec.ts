import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { ClassGroupStatus, LessonStatus, PrismaClient, UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const PREFIX = "qa.teacher-materials";

type Fixture = {
  createdTitle: string;
  editedTitle: string;
  foreignMaterialId: string;
  groupId: string;
  groupName: string;
  lessonId: string;
  lessonTitle: string;
  materialTitle: string;
  teacherEmail: string;
  teacherId: string;
  teacherName: string;
};

let fixture: Fixture;

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

async function confirmDeleteMaterial(page: Page, card: Locator) {
  const deleteButton = card.getByRole("button", { name: /^delete$/i });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();

  const confirmation = page.getByText(/delete this material/i);
  try {
    await expect(confirmation).toBeVisible({ timeout: 2_000 });
  } catch {
    await deleteButton.click();
    await expect(confirmation).toBeVisible();
  }

  await page.getByRole("button", { name: /confirm delete/i }).click();
}

test.describe("Teacher course materials portal", () => {
  test.describe.configure({ timeout: 240000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    fixture = await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("teacher can create, edit, delete materials and cannot edit another teacher material", async ({
    page,
  }) => {
    await setPortalSession(page);
    await page.goto(`${BASE_URL}/portal/teacher/materials`);

    await expect(page.getByRole("heading", { name: /materials/i })).toBeVisible();
    await expect(page.getByText(fixture.materialTitle)).toBeVisible();
    await expect(page.getByRole("link", { name: /view file/i }).first()).toHaveAttribute(
      "href",
      /\/uploads\/teacher\/existing\.pdf/,
    );
    await expect(page.getByRole("link", { name: /create material/i })).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher`);
    await expect(page.getByRole("link", { exact: true, name: "Materials" })).toHaveAttribute(
      "href",
      "/portal/teacher/materials",
    );

    await page.goto(`${BASE_URL}/portal/teacher/classes/${fixture.groupId}`);
    await expect(page.getByRole("link", { exact: true, name: "Materials" })).toHaveAttribute(
      "href",
      `/portal/teacher/materials?classGroupId=${fixture.groupId}`,
    );

    await page.goto(`${BASE_URL}/portal/teacher/lessons/${fixture.lessonId}`);
    await expect(page.getByText(/teacher materials route is not implemented/i)).toHaveCount(0);
    await expect(page.getByRole("link", { exact: true, name: "Materials" })).toHaveAttribute(
      "href",
      new RegExp(`/portal/teacher/materials(/new)?\\?scheduledClassId=${fixture.lessonId}`),
    );

    await page.goto(
      `${BASE_URL}/portal/teacher/materials/new?scheduledClassId=${fixture.lessonId}`,
    );
    await page.getByLabel(/^title$/i).fill(fixture.createdTitle);
    await page.getByLabel(/description/i).fill("Created from E2E materials flow.");
    await page.getByLabel(/file url/i).fill("/uploads/teacher/material-e2e.pdf");
    await page.getByLabel(/lesson|scheduled class/i).selectOption(fixture.lessonId);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/portal/teacher/materials/new") &&
          response.status() < 500,
      ),
      page.getByRole("button", { name: /create material/i }).click(),
    ]);

    await page.waitForURL(/\/portal\/teacher\/materials/, { timeout: 15_000 });
    await expect(page.getByText(fixture.createdTitle)).toBeVisible();

    const createdEditHref = await page
      .locator("article")
      .filter({ hasText: fixture.createdTitle })
      .getByRole("link", { name: /edit/i })
      .getAttribute("href");
    expect(createdEditHref).toBeTruthy();
    await page.goto(`${BASE_URL}${createdEditHref}`);
    await page.getByLabel(/^title$/i).fill(fixture.editedTitle);
    await page.getByLabel(/description/i).fill("Edited from E2E materials flow.");
    await page.getByLabel(/file url/i).fill("https://cdn.school/materials/edited-e2e.pdf");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/portal/teacher/materials/") &&
          response.status() < 500,
      ),
      page.getByRole("button", { name: /save changes/i }).click(),
    ]);

    await page.waitForURL(/\/portal\/teacher\/materials/, { timeout: 15_000 });
    await expect(page.getByText(fixture.editedTitle)).toBeVisible();

    const editedCard = page
      .locator("article")
      .filter({ has: page.locator(`a[href="${createdEditHref}"]`) })
      .first();
    await confirmDeleteMaterial(page, editedCard);
    await expect(page.getByText(fixture.editedTitle)).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/teacher/materials/${fixture.foreignMaterialId}/edit`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|denied/i).first(),
    ).toBeVisible();

    await page.goto(`${BASE_URL}/portal/teacher/materials`);
    await expect(page.getByRole("link", { name: /javascript:|data:|file:/i })).toHaveCount(0);
  });

  test("teacher can upload, replace, and delete material files through the UI", async ({
    page,
  }, testInfo) => {
    const uploadDir = testInfo.outputPath("material-fixtures");
    await mkdir(uploadDir, { recursive: true });
    const firstFile = path.join(uploadDir, "worksheet-upload.pdf");
    const replacementFile = path.join(uploadDir, "worksheet-replacement.pdf");
    await writeFile(firstFile, "first pdf");
    await writeFile(replacementFile, "replacement pdf");

    await setPortalSession(page);
    await page.goto(
      `${BASE_URL}/portal/teacher/materials/new?scheduledClassId=${fixture.lessonId}`,
    );

    await page.getByLabel(/^title$/i).fill(`QA Teacher Materials Uploaded ${Date.now()}`);
    await page.getByLabel(/description/i).fill("Uploaded from E2E materials flow.");
    await page.getByLabel(/lesson|scheduled class/i).selectOption(fixture.lessonId);
    await page.getByLabel(/upload file|file upload|choose file/i).setInputFiles(firstFile);

    await expect(page.getByText(/worksheet-upload\.pdf/i)).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/upload") &&
          response.status() < 500,
      ),
      page.getByRole("button", { name: /^(upload|retry upload|replace upload)$/i }).click(),
    ]);
    await expect(page.getByText(/^Upload complete:/i)).toBeVisible();
    await expect(page.locator('input[name="storageKey"], input[name$=".storageKey"]')).toHaveCount(
      0,
    );

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/portal/teacher/materials/new") &&
          response.status() < 500,
      ),
      page.getByRole("button", { name: /create material/i }).click(),
    ]);
    await page.goto(`${BASE_URL}/portal/teacher/materials`);
    await expect(page.getByRole("link", { name: /view worksheet-upload\.pdf/i })).toBeVisible();

    const uploadedCard = page.locator("article").filter({ hasText: /worksheet-upload\.pdf/i });
    await expect(
      uploadedCard.getByRole("link", { name: /view file|worksheet-upload\.pdf/i }),
    ).toBeVisible();
    const uploadedEditHref = await uploadedCard
      .getByRole("link", { name: /edit/i })
      .getAttribute("href");
    expect(uploadedEditHref).toBeTruthy();
    await page.goto(`${BASE_URL}${uploadedEditHref}`);

    await expect(page.getByText(/current file/i).first()).toBeVisible();
    await page.getByLabel(/upload file|file upload|choose file/i).setInputFiles(replacementFile);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/upload") &&
          response.status() < 500,
      ),
      page.getByRole("button", { name: /^(upload|retry upload|replace upload)$/i }).click(),
    ]);
    await expect(page.getByText("worksheet-replacement.pdf").first()).toBeVisible();
    await expect(page.getByText(/^Upload complete:/i)).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/portal/teacher/materials/") &&
          response.status() < 500,
      ),
      page.getByRole("button", { name: /save changes/i }).click(),
    ]);

    await page.goto(`${BASE_URL}/portal/teacher/materials`);
    await expect(page.locator('a[href*="worksheet-replacement"]')).toBeVisible();

    const replacementCard = page
      .locator("article")
      .filter({ has: page.locator('a[href*="worksheet-replacement"]') })
      .first();
    await confirmDeleteMaterial(page, replacementCard);
    await expect(page.locator('a[href*="worksheet-replacement"]')).toHaveCount(0);

    await page.goto(`${BASE_URL}/portal/teacher/materials/${fixture.foreignMaterialId}/edit`);
    await expect(
      page.getByText(/not found|404|unauthorized|forbidden|denied/i).first(),
    ).toBeVisible();
  });
});

async function createFixtures(): Promise<Fixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const teacherName = `QA Teacher Materials A ${suffix}`;
  const teacherBName = `QA Teacher Materials B ${suffix}`;
  const groupName = `QA Teacher Materials Group ${suffix}`;
  const lessonTitle = `QA Teacher Materials Lesson ${suffix}`;
  const materialTitle = `QA Teacher Materials Existing ${suffix}`;
  const createdTitle = `QA Teacher Materials Created ${suffix}`;
  const editedTitle = `QA Teacher Materials Edited ${suffix}`;
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  const [teacherA, teacherB] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: `${PREFIX}.teacher-a.${suffix}@example.com`,
        fullName: teacherName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.TEACHER,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${PREFIX}.teacher-b.${suffix}@example.com`,
        fullName: teacherBName,
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.TEACHER,
      },
    }),
  ]);

  const [groupA, groupB] = await Promise.all([
    prisma.classGroup.create({
      data: {
        name: groupName,
        status: ClassGroupStatus.ACTIVE,
        teacherId: teacherA.id,
      },
    }),
    prisma.classGroup.create({
      data: {
        name: `QA Teacher Materials Foreign Group ${suffix}`,
        status: ClassGroupStatus.ACTIVE,
        teacherId: teacherB.id,
      },
    }),
  ]);

  const [lessonA, lessonB] = await Promise.all([
    prisma.scheduledClass.create({
      data: {
        classGroupId: groupA.id,
        endAt,
        meetingProvider: "MANUAL_URL",
        startAt,
        status: LessonStatus.SCHEDULED,
        teacherId: teacherA.id,
        timezone: "Europe/Kiev",
        title: lessonTitle,
      },
    }),
    prisma.scheduledClass.create({
      data: {
        classGroupId: groupB.id,
        endAt,
        meetingProvider: "MANUAL_URL",
        startAt,
        status: LessonStatus.SCHEDULED,
        teacherId: teacherB.id,
        timezone: "Europe/Kiev",
        title: `QA Teacher Materials Foreign Lesson ${suffix}`,
      },
    }),
  ]);

  const [materialA, materialB] = await Promise.all([
    prisma.courseMaterial.create({
      data: {
        description: "Existing material",
        fileUrl: "/uploads/teacher/existing.pdf",
        scheduledClassId: lessonA.id,
        teacherId: teacherA.id,
        title: materialTitle,
      },
    }),
    prisma.courseMaterial.create({
      data: {
        description: "Foreign material",
        fileUrl: "/uploads/teacher/foreign.pdf",
        scheduledClassId: lessonB.id,
        teacherId: teacherB.id,
        title: `QA Teacher Materials Foreign ${suffix}`,
      },
    }),
  ]);

  void materialA;

  return {
    createdTitle,
    editedTitle,
    foreignMaterialId: materialB.id,
    groupId: groupA.id,
    groupName,
    lessonId: lessonA.id,
    lessonTitle,
    materialTitle,
    teacherEmail: teacherA.email,
    teacherId: teacherA.id,
    teacherName,
  };
}

async function cleanupFixtures() {
  await prisma.attachment.deleteMany({
    where: { courseMaterial: { title: { startsWith: "QA Teacher Materials" } } },
  });
  await prisma.courseMaterial.deleteMany({
    where: { title: { startsWith: "QA Teacher Materials" } },
  });
  await prisma.scheduledClass.deleteMany({
    where: { title: { startsWith: "QA Teacher Materials" } },
  });
  await prisma.classGroup.deleteMany({ where: { name: { startsWith: "QA Teacher Materials" } } });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: PREFIX } } });
}
