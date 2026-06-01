import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const ADMIN_NAME = "Fixed Admin";
const ADMIN_ID = "admin-123";
const COOKIE_DOMAIN = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").hostname;

const ADMIN_ONLY_ROUTES = [
  { path: "/admin", heading: "Admin Dashboard" },
  { path: "/admin/users", heading: "User Management" },
  { path: "/admin/security", heading: "Admin Security" },
  { path: "/admin/billing", heading: "Billing" },
  { path: "/admin/audit", heading: "Audit Log" },
] as const;

const NON_ADMIN_USERS = [
  {
    label: "teacher",
    uid: "teacher-123",
    role: UserRole.TEACHER,
    email: "fixed.teacher@uluglobalacademy.com",
    fullName: "Fixed Teacher",
  },
  {
    label: "student",
    uid: "student-101",
    role: UserRole.STUDENT,
    email: "fixed.student@uluglobalacademy.com",
    fullName: "Fixed Student",
  },
  {
    label: "parent",
    uid: "parent-123",
    role: UserRole.PARENT,
    email: "fixed.parent@uluglobalacademy.com",
    fullName: "Fixed Parent",
  },
] as const;

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
      domain: COOKIE_DOMAIN,
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: true,
      name: "ulu_session",
      path: "/",
      sameSite: "Lax",
      value: await createSessionToken(input),
    },
  ]);
}

async function expectRedirectedAwayFromAdminRoute(
  page: Page,
  route: (typeof ADMIN_ONLY_ROUTES)[number],
) {
  const response = await page.goto(route.path, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const redirectSource = response?.request().redirectedFrom();
  const redirectResponse = await redirectSource?.response();

  expect(redirectSource?.url()).toContain(route.path);
  expect(redirectResponse?.status()).toBeGreaterThanOrEqual(300);
  expect(redirectResponse?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/portal\/unauthorized/);
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("heading", { name: route.heading, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin Dashboard" })).toHaveCount(0);
}

test.describe("Admin Portal", () => {
  test.beforeEach(async ({ page }) => {
    await setPortalSession(page, {
      uid: ADMIN_ID,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: ADMIN_NAME,
    });
  });

  test("admin dashboard loads", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded", timeout: 120000 });
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("admin users page loads", async ({ page }) => {
    await page.goto("/admin/users", { waitUntil: "domcontentloaded", timeout: 120000 });
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("admin billing page loads", async ({ page }) => {
    await page.goto("/admin/billing", { waitUntil: "domcontentloaded", timeout: 120000 });
    await expect(page.getByRole("main")).toBeVisible();
  });

  for (const user of NON_ADMIN_USERS) {
    test(`${user.label} direct URL access is rejected for admin-only routes`, async ({ page }) => {
      await setPortalSession(page, user);

      for (const route of ADMIN_ONLY_ROUTES) {
        await expectRedirectedAwayFromAdminRoute(page, route);
      }
    });
  }
});
