import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const USER_EMAIL = `qa.users.${RUN_ID}@example.com`;
const USER_NAME = `QA Users ${RUN_ID}`;

let adminUserId = "";
let createdUserId = "";

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
  page: Page,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
  },
) {
  await page.context().clearCookies();
  await page.context().addCookies([
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

async function cleanupQaUsersData() {
  const users = await prisma.appUser.findMany({
    where: { email: { startsWith: "qa.users." } },
    select: { id: true },
  });

  if (users.length > 0) {
    await prisma.adminAuditLog.deleteMany({
      where: {
        targetType: "app_user",
        targetId: { in: users.map((user) => user.id) },
      },
    });
  }

  await prisma.appUser.deleteMany({
    where: { email: { startsWith: "qa.users." } },
  });
}

function createUserSection(page: Page) {
  return page.getByRole("heading", { name: "Create User" }).locator("xpath=ancestor::section[1]");
}

function userRow(page: Page, email: string) {
  return page.locator('section[aria-label="User accounts"] > div').filter({ hasText: email });
}

test.describe("Admin Users CRUD", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaUsersData();
    const admin = await prisma.appUser.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    });
    adminUserId = admin.id;
  });

  test.afterAll(async () => {
    await cleanupQaUsersData();
    await prisma.$disconnect();
  });

  test("admin creates a user, validates input, updates role/status, and audits only successful mutations", async ({
    page,
  }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    const createSection = createUserSection(page);
    const auditCountBeforeInvalidSubmits = await prisma.adminAuditLog.count({
      where: { action: "APP_USER_CREATED", targetType: "app_user" },
    });

    await createSection.getByRole("button", { name: "Create User" }).click();
    await expect(createSection.getByText("Full name is required.")).toBeVisible();
    await expect(createSection.getByText("Email is required.")).toBeVisible();
    await expect(
      prisma.adminAuditLog.count({
        where: { action: "APP_USER_CREATED", targetType: "app_user" },
      }),
    ).resolves.toBe(auditCountBeforeInvalidSubmits);

    await createSection.getByLabel("Full name").fill(USER_NAME);
    await createSection.getByLabel("Email").fill("not-an-email");
    await createSection.getByRole("button", { name: "Create User" }).click();
    await expect(createSection.getByText("Enter a valid email address.")).toBeVisible();
    await expect(
      prisma.adminAuditLog.count({
        where: { action: "APP_USER_CREATED", targetType: "app_user" },
      }),
    ).resolves.toBe(auditCountBeforeInvalidSubmits);

    await createSection.getByLabel("Email").fill(USER_EMAIL);
    await createSection.getByLabel("Role").selectOption(UserRole.STUDENT);
    await createSection.getByRole("button", { name: "Create User" }).click();
    await expect(createSection.getByText(/default password/i)).toBeVisible({ timeout: 15000 });

    const createdUser = await prisma.appUser.findUniqueOrThrow({
      where: { email: USER_EMAIL },
      select: { id: true, role: true, isActive: true },
    });
    createdUserId = createdUser.id;
    expect(createdUser).toEqual(
      expect.objectContaining({ role: UserRole.STUDENT, isActive: true }),
    );

    await page.goto(`/admin/users?q=${encodeURIComponent(USER_EMAIL)}`);
    await expect(userRow(page, USER_EMAIL)).toBeVisible();
    await page.reload();
    await expect(userRow(page, USER_EMAIL)).toBeVisible();

    await userRow(page, USER_EMAIL).getByLabel("Role").selectOption(UserRole.TEACHER);
    await expect(userRow(page, USER_EMAIL).getByText("User role updated.")).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(async () => {
        const user = await prisma.appUser.findUnique({
          where: { id: createdUserId },
          select: { role: true },
        });
        return user?.role;
      })
      .toBe(UserRole.TEACHER);

    await page.reload();
    await expect(userRow(page, USER_EMAIL).getByLabel("Role")).toHaveValue(UserRole.TEACHER);

    await userRow(page, USER_EMAIL).getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByRole("dialog", { name: /deactivate user account/i })).toContainText(
      USER_EMAIL,
    );
    await page.getByRole("button", { name: /confirm deactivation/i }).click();
    await expect(userRow(page, USER_EMAIL).getByText("User status updated.")).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(async () => {
        const user = await prisma.appUser.findUnique({
          where: { id: createdUserId },
          select: { isActive: true },
        });
        return user?.isActive;
      })
      .toBe(false);

    await page.reload();
    await expect(userRow(page, USER_EMAIL).getByText("Inactive")).toBeVisible();
    await expect(userRow(page, USER_EMAIL).getByRole("button", { name: "Activate" })).toBeVisible();

    const createdAuditCount = await prisma.adminAuditLog.count({
      where: {
        action: "APP_USER_CREATED",
        targetType: "app_user",
        targetId: createdUserId,
      },
    });

    await createSection.getByLabel("Full name").fill(`${USER_NAME} Duplicate`);
    await createSection.getByLabel("Email").fill(USER_EMAIL);
    await createSection.getByLabel("Role").selectOption(UserRole.STUDENT);
    await createSection.getByRole("button", { name: "Create User" }).click();
    await expect(createSection.getByText(/already exists/i)).toBeVisible({ timeout: 15000 });

    await expect(
      prisma.adminAuditLog.count({
        where: {
          action: "APP_USER_CREATED",
          targetType: "app_user",
          targetId: createdUserId,
        },
      }),
    ).resolves.toBe(createdAuditCount);

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "app_user",
        targetId: createdUserId,
        action: {
          in: ["APP_USER_CREATED", "APP_USER_ROLE_UPDATED", "APP_USER_STATUS_UPDATED"],
        },
      },
    });
    const serializedLogs = JSON.stringify(auditLogs);
    expect(auditLogs.some((log) => log.action === "APP_USER_CREATED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "APP_USER_ROLE_UPDATED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "APP_USER_STATUS_UPDATED")).toBe(true);
    expect(serializedLogs).not.toMatch(/password|passwordHash|token|secret|ChangeMe123/i);
  });
});
