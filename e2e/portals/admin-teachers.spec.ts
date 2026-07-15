import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const PASSWORD =
  process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEACHER_PREFIX = "E2E Teacher";
const USER_EMAIL_PREFIX = "e2e.teacher.";
const TEST_DIR = path.join(process.cwd(), ".e2e-debug", "admin-teachers");

const validPngPath = path.join(TEST_DIR, "valid.png");
const invalidSvgPath = path.join(TEST_DIR, "invalid.svg");
const oversizedPngPath = path.join(TEST_DIR, "oversized.png");

const createdTeacherIds: string[] = [];

type TestUsers = {
  editUser: { id: string; email: string };
  deleteUser: { id: string; email: string };
  linkedUser: { id: string; email: string };
  inactiveUser: { id: string; email: string };
  parentUser: { id: string; email: string };
};

let testUsers: TestUsers;

test.describe("Admin Teacher Management", () => {
  test.describe.configure({ timeout: 420000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupTestData();
    ensureUploadFixtures();
    testUsers = await createCabinetAccessFixtures();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  test("protects routes and manages teacher profiles end to end", async ({ browser, page }) => {
    await verifyAccessControl(browser);

    await loginAsAdmin(page);
    await page.goto("/admin/teachers");
    await expect(page.getByRole("heading", { level: 1, name: "Teachers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Teacher" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Cabinet access" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actions" })).toBeVisible();

    await verifyRequiredValidation(page);
    await verifyUploadValidation(page);
    const createUser = await createTeacherCabinetUser(page);
    await verifyCabinetAccessFiltering(page, createUser.email);

    const mainTeacher = await createTeacherProfile(page, {
      fullName: `${TEACHER_PREFIX} Flow ${RUN_ID}`,
      title: "E2E Mathematics Mentor",
      bio: "This e2e teacher profile verifies the admin teacher workflow through a real browser.",
      displayOrder: 8,
      subjects: ["Mathematics", "Physics"],
      cabinetUserId: createUser.id,
      photoPath: validPngPath,
    });

    const createdRow = rowByText(page, mainTeacher.fullName);
    const createdPhotoUrl = requirePhotoUrl(mainTeacher.photoUrl);
    await expect(createdRow.getByRole("img", { name: mainTeacher.fullName })).toBeVisible();
    await expect(createdRow.getByRole("img", { name: mainTeacher.fullName })).toHaveAttribute(
      "src",
      createdPhotoUrl,
    );
    await expect(createdRow).toContainText("Linked account");

    const updatedName = `${TEACHER_PREFIX} Flow Updated ${RUN_ID}`;
    await editTeacherProfile(page, mainTeacher.id, {
      fullName: updatedName,
      title: "E2E Science Lead",
      bio: "Updated e2e biography verifies field persistence, subject replacement, cabinet changes, and photo removal.",
      displayOrder: 9,
      checkSubjects: ["Biology", "Chemistry"],
      uncheckSubjects: ["Mathematics", "Physics"],
      cabinetUserId: testUsers.editUser.id,
      photoPath: validPngPath,
    });

    await page.reload();
    const updatedRow = rowByText(page, updatedName);
    await expect(updatedRow).toBeVisible();

    const updatedTeacher = await prisma.teacher.findUniqueOrThrow({
      where: { id: mainTeacher.id },
      include: { teacherSubjects: { include: { subject: true } } },
    });
    expect(updatedTeacher.cabinetUserId).toBe(testUsers.editUser.id);
    expect(updatedTeacher.teacherSubjects.map((item) => item.subject.name).sort()).toEqual([
      "Biology",
      "Chemistry",
    ]);
    await expect(updatedRow.getByRole("img", { name: updatedName })).toHaveAttribute(
      "src",
      requirePhotoUrl(updatedTeacher.photoUrl),
    );

    await removeTeacherPhoto(page, mainTeacher.id, updatedName);
    await verifyStatusToggleAndPublicFiltering(page, updatedName);

    const orderedTeacher = await createTeacherProfile(page, {
      fullName: `${TEACHER_PREFIX} Ordered ${RUN_ID}`,
      title: "E2E Ordered Teacher",
      bio: "This e2e teacher profile verifies display order sorting in admin and public teachers pages.",
      displayOrder: 7,
      subjects: ["English"],
      cabinetUserId: "",
    });
    await verifyDisplayOrder(page, orderedTeacher.fullName, updatedName);

    const deleteTeacher = await createTeacherProfile(page, {
      fullName: `${TEACHER_PREFIX} Delete ${RUN_ID}`,
      title: "E2E Delete Teacher",
      bio: "This e2e teacher profile verifies delete behavior without deleting its linked AppUser.",
      displayOrder: 99,
      subjects: ["ICT"],
      cabinetUserId: testUsers.deleteUser.id,
    });
    await deleteTeacherProfile(page, deleteTeacher.id, deleteTeacher.fullName);

    await verifyAuditLogs(page, [mainTeacher.id, orderedTeacher.id, deleteTeacher.id]);
  });
});

async function verifyAccessControl(browser: Browser) {
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto("/admin/teachers");
  await guestPage.waitForURL(/\/portal\/login/);
  expect(guestPage.url()).toContain("reason=invalid");
  await guestContext.close();

  for (const [email, expectedPath] of [
    ["fixed.student@uluglobalacademy.com", /\/portal\/student/],
    ["fixed.teacher2@uluglobalacademy.com", /\/portal\/teacher/],
    ["fixed.parent@uluglobalacademy.com", /\/portal\/parent/],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAs(page, email, expectedPath);
    await page.goto("/admin/teachers");
    await page.waitForURL(/\/portal\/unauthorized/, { timeout: 60000 });
    await context.close();
  }
}

async function loginAsAdmin(page: Page) {
  await loginAs(page, ADMIN_EMAIL, /\/(admin|security)/);
  await page.goto("/admin/teachers");
  await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible({ timeout: 30000 });
}

async function loginAs(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL(expectedPath, { timeout: 60000 });
}

async function verifyRequiredValidation(page: Page) {
  await page.goto("/admin/teachers/new");
  await page.getByRole("button", { name: "Create Teacher" }).click();
  await expect(page.getByText("Full name must be at least 2 characters")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("Bio must be at least 20 characters")).toBeVisible();
}

async function verifyCabinetAccessFiltering(page: Page, createUserEmail: string) {
  await page.goto("/admin/teachers/new");
  const cabinetOptions = await page.getByRole("combobox", { name: "Cabinet access" }).textContent();

  expect(cabinetOptions).toContain(createUserEmail);
  expect(cabinetOptions).not.toContain(testUsers.linkedUser.email);
  expect(cabinetOptions).not.toContain(testUsers.inactiveUser.email);
  expect(cabinetOptions).not.toContain(testUsers.parentUser.email);
}

async function verifyUploadValidation(page: Page) {
  await page.goto("/admin/teachers/new");
  await fillTeacherForm(page, {
    fullName: `${TEACHER_PREFIX} Invalid Svg ${RUN_ID}`,
    title: "E2E Upload Validation",
    bio: "This profile validates SVG upload rejection without creating teacher data.",
    displayOrder: 30,
    subjects: ["Mathematics"],
    cabinetUserId: "",
    photoPath: invalidSvgPath,
  });
  await page.getByRole("button", { name: "Create Teacher" }).click();
  await expect(page.getByText("Teacher photo must be a JPG")).toBeVisible({
    timeout: 30000,
  });

  await page.goto("/admin/teachers/new");
  await fillTeacherForm(page, {
    fullName: `${TEACHER_PREFIX} Oversized ${RUN_ID}`,
    title: "E2E Upload Validation",
    bio: "This profile validates oversized upload rejection without an application error page.",
    displayOrder: 31,
    subjects: ["Mathematics"],
    cabinetUserId: "",
    photoPath: oversizedPngPath,
  });
  await page.getByRole("button", { name: "Create Teacher" }).click();
  await expect(page.getByText("Teacher photo must be 5 MB or smaller")).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
}

async function createTeacherProfile(
  page: Page,
  input: {
    fullName: string;
    title: string;
    bio: string;
    displayOrder: number;
    subjects: string[];
    cabinetUserId?: string;
    photoPath?: string;
  },
) {
  await page.goto("/admin/teachers/new");
  await fillTeacherForm(page, input);
  await page.getByRole("button", { name: "Create Teacher" }).click();

  const row = rowByText(page, input.fullName);
  await expect(row).toBeVisible({ timeout: 60000 });

  const teacher = await prisma.teacher.findFirstOrThrow({
    where: { fullName: input.fullName },
  });
  createdTeacherIds.push(teacher.id);
  return teacher;
}

async function createTeacherCabinetUser(page: Page) {
  const email = `${USER_EMAIL_PREFIX}create.${RUN_ID}@uluglobalacademy.com`;
  const fullName = `${TEACHER_PREFIX} Cabinet ${RUN_ID}`;

  await page.goto("/admin/users");
  const createUserSection = page
    .getByRole("heading", { name: "Create User" })
    .locator("xpath=ancestor::section[1]");
  await createUserSection.getByLabel("Full name").fill(fullName);
  await createUserSection.getByLabel("Email").fill(email);
  await createUserSection.getByLabel("Role").selectOption(UserRole.TEACHER);
  await createUserSection.getByRole("button", { name: "Create User" }).click();

  await expect(page.getByRole("region", { name: /^temporary credentials$/i })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Dismiss temporary credentials" }).click();

  return prisma.appUser.findUniqueOrThrow({
    select: { email: true, id: true },
    where: { email },
  });
}

async function editTeacherProfile(
  page: Page,
  teacherId: string,
  input: {
    fullName: string;
    title: string;
    bio: string;
    displayOrder: number;
    checkSubjects: string[];
    uncheckSubjects: string[];
    cabinetUserId: string;
    photoPath: string;
  },
) {
  await page.goto(`/admin/teachers/${teacherId}/edit`);
  await page.getByRole("textbox", { name: "Full name" }).fill(input.fullName);
  await page.getByRole("textbox", { name: "Title" }).fill(input.title);
  await page.getByRole("textbox", { name: "Bio" }).fill(input.bio);
  await page.getByRole("spinbutton", { name: "Display order" }).fill(String(input.displayOrder));

  for (const subject of input.checkSubjects) {
    await page.getByRole("checkbox", { name: subject, exact: true }).check();
  }
  for (const subject of input.uncheckSubjects) {
    await page.getByRole("checkbox", { name: subject, exact: true }).uncheck();
  }

  await page.getByRole("combobox", { name: "Cabinet access" }).selectOption(input.cabinetUserId);
  await page.locator('input[type="file"][name="photo"]').setInputFiles(input.photoPath);
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(rowByText(page, input.fullName)).toBeVisible({ timeout: 60000 });
}

function requirePhotoUrl(photoUrl: string | null) {
  expect(photoUrl).toBeTruthy();
  if (!photoUrl) {
    throw new Error("Expected teacher photo to persist after upload.");
  }
  return photoUrl;
}

async function removeTeacherPhoto(page: Page, teacherId: string, teacherName: string) {
  await page.goto(`/admin/teachers/${teacherId}/edit`);
  const beforeCancel = await prisma.teacher.findUniqueOrThrow({ where: { id: teacherId } });

  await page.getByRole("checkbox", { name: "Remove current photo" }).check();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("dialog", { name: /remove teacher photo/i })).toContainText(
    teacherName,
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: /remove teacher photo/i })).toHaveCount(0);
  const afterCancel = await prisma.teacher.findUniqueOrThrow({ where: { id: teacherId } });
  expect(afterCancel.photoUrl).toBe(beforeCancel.photoUrl);

  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("dialog", { name: /remove teacher photo/i })).toContainText(
    teacherName,
  );
  await page.getByRole("button", { name: /remove photo/i }).click();

  const row = rowByText(page, teacherName);
  await expect(row).toBeVisible({ timeout: 60000 });
  await expect(
    row.getByRole("img", { name: `Placeholder avatar for ${teacherName}` }),
  ).toBeVisible();

  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id: teacherId } });
  expect(teacher.photoUrl).toBeNull();
}

async function verifyStatusToggleAndPublicFiltering(page: Page, teacherName: string) {
  await page.goto("/admin/teachers");
  let row = rowByText(page, teacherName);
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("dialog", { name: /deactivate teacher account/i })).toContainText(
    teacherName,
  );
  await page.getByRole("button", { name: /confirm deactivation/i }).click();
  await expect(page.getByText("Teacher profile deactivated.")).toBeVisible({ timeout: 60000 });

  await page.reload();
  row = rowByText(page, teacherName);
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible();

  await page.goto("/teachers");
  await expect(page.getByText(teacherName)).toHaveCount(0);

  await page.goto("/admin/teachers");
  row = rowByText(page, teacherName);
  await row.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByText("Teacher profile activated.")).toBeVisible({ timeout: 60000 });

  await page.goto("/teachers");
  await expect(page.getByText(teacherName)).toBeVisible();
}

async function verifyDisplayOrder(page: Page, earlierTeacher: string, laterTeacher: string) {
  await page.goto("/admin/teachers");
  const adminListText = await page.locator("table").innerText();
  expect(adminListText.indexOf(earlierTeacher)).toBeGreaterThanOrEqual(0);
  expect(adminListText.indexOf(laterTeacher)).toBeGreaterThanOrEqual(0);
  expect(adminListText.indexOf(earlierTeacher)).toBeLessThan(adminListText.indexOf(laterTeacher));

  await page.goto("/teachers");
  const publicText = await page.locator("body").innerText();
  expect(publicText.indexOf(earlierTeacher)).toBeGreaterThanOrEqual(0);
  expect(publicText.indexOf(laterTeacher)).toBeGreaterThanOrEqual(0);
  expect(publicText.indexOf(earlierTeacher)).toBeLessThan(publicText.indexOf(laterTeacher));
}

async function deleteTeacherProfile(page: Page, teacherId: string, teacherName: string) {
  await page.goto("/admin/teachers");
  const row = rowByText(page, teacherName);
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: /confirm teacher deletion/i })).toContainText(
    teacherName,
  );
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("Teacher profile deleted.")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(teacherName)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(teacherName)).toHaveCount(0);
  const linkedUser = await prisma.appUser.findUnique({ where: { id: testUsers.deleteUser.id } });
  expect(linkedUser).not.toBeNull();

  const deleted = await prisma.teacher.findUnique({ where: { id: teacherId } });
  expect(deleted).toBeNull();
}

async function verifyAuditLogs(page: Page, teacherIds: string[]) {
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible();

  for (const action of [
    "TEACHER_PROFILE_CREATED",
    "TEACHER_PROFILE_UPDATED",
    "TEACHER_PROFILE_STATUS_UPDATED",
    "TEACHER_PROFILE_DELETED",
  ]) {
    await expect(page.getByText(action).first()).toBeVisible({ timeout: 30000 });
  }

  const logs = await prisma.adminAuditLog.findMany({
    where: {
      targetType: "teacher",
      targetId: { in: teacherIds },
    },
    orderBy: { createdAt: "desc" },
  });
  const actions = new Set(logs.map((log) => log.action));

  expect([...actions]).toEqual(
    expect.arrayContaining([
      "TEACHER_PROFILE_CREATED",
      "TEACHER_PROFILE_UPDATED",
      "TEACHER_PROFILE_STATUS_UPDATED",
      "TEACHER_PROFILE_DELETED",
    ]),
  );
  expect(JSON.stringify(logs)).not.toMatch(/password|passwordHash|twoFactorSecret|backup/i);
}

async function fillTeacherForm(
  page: Page,
  input: {
    fullName: string;
    title: string;
    bio: string;
    displayOrder: number;
    subjects: string[];
    cabinetUserId?: string;
    photoPath?: string;
  },
) {
  await page.getByRole("textbox", { name: "Full name" }).fill(input.fullName);
  await page.getByRole("textbox", { name: "Title" }).fill(input.title);
  await page.getByRole("textbox", { name: "Bio" }).fill(input.bio);
  await page.getByRole("spinbutton", { name: "Display order" }).fill(String(input.displayOrder));

  for (const subject of input.subjects) {
    await page.getByRole("checkbox", { name: subject, exact: true }).check();
  }

  if (input.cabinetUserId !== undefined) {
    await page.getByRole("combobox", { name: "Cabinet access" }).selectOption(input.cabinetUserId);
  }

  if (input.photoPath) {
    await page.locator('input[type="file"][name="photo"]').setInputFiles(input.photoPath);
  }
}

function rowByText(page: Page, text: string) {
  return page.locator("tbody tr").filter({ hasText: text }).first();
}

async function createCabinetAccessFixtures(): Promise<TestUsers> {
  const passwordHash = await hashPassword(PASSWORD);
  const users = await Promise.all([
    createTestUser("edit", UserRole.TEACHER, true, passwordHash),
    createTestUser("delete", UserRole.TEACHER, true, passwordHash),
    createTestUser("linked", UserRole.TEACHER, true, passwordHash),
    createTestUser("inactive", UserRole.TEACHER, false, passwordHash),
    createTestUser("parent", UserRole.PARENT, true, passwordHash),
  ]);
  const [editUser, deleteUser, linkedUser, inactiveUser, parentUser] = users;

  const mathematics = await prisma.subject.findFirstOrThrow({
    where: { name: "Mathematics" },
    select: { id: true },
  });
  const linkedTeacher = await prisma.teacher.create({
    data: {
      fullName: `${TEACHER_PREFIX} Already Linked ${RUN_ID}`,
      title: "E2E Linked Teacher",
      bio: "This support teacher profile reserves one teacher AppUser for cabinet filtering checks.",
      cabinetUserId: linkedUser.id,
      displayOrder: 200,
      isActive: true,
      teacherSubjects: {
        create: [{ subjectId: mathematics.id }],
      },
    },
    select: { id: true },
  });
  createdTeacherIds.push(linkedTeacher.id);

  return {
    editUser,
    deleteUser,
    linkedUser,
    inactiveUser,
    parentUser,
  };
}

async function createTestUser(
  label: string,
  role: UserRole,
  isActive: boolean,
  passwordHash: string,
) {
  return prisma.appUser.create({
    data: {
      email: `${USER_EMAIL_PREFIX}${label}.${RUN_ID}@uluglobalacademy.com`,
      fullName: `E2E ${label} teacher ${RUN_ID}`,
      role,
      passwordHash,
      isActive,
    },
    select: { id: true, email: true },
  });
}

async function cleanupTestData() {
  const teachers = await prisma.teacher.findMany({
    where: { fullName: { startsWith: TEACHER_PREFIX } },
    select: { id: true },
  });
  const teacherIds = [...new Set([...teachers.map((teacher) => teacher.id), ...createdTeacherIds])];

  if (teacherIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({
      where: { targetType: "teacher", targetId: { in: teacherIds } },
    });
  }

  await prisma.teacher.deleteMany({
    where: { fullName: { startsWith: TEACHER_PREFIX } },
  });
  await prisma.appUser.deleteMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
  });
}

function ensureUploadFixtures() {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(
    validPngPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/l1skWQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  writeFileSync(
    invalidSvgPath,
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  writeFileSync(oversizedPngPath, Buffer.alloc(6 * 1024 * 1024));
}
