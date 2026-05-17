import { type Page, expect, test } from "@playwright/test";
import { EnquiryStatus, PaymentStatus, SubscriptionStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAdvancedBIMetrics } from "@/lib/repositories/analytics-repository";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STUDENT_EMAIL = `qa.analytics.student.${RUN_ID}@example.com`;
const STUDENT_NAME = `QA Analytics Student ${RUN_ID}`;
const ACTIVE_PLAN = `QA Analytics Active ${RUN_ID}`;
const CANCELLED_PLAN = `QA Analytics Cancelled ${RUN_ID}`;
const PAST_DUE_PLAN = `QA Analytics Past Due ${RUN_ID}`;
const TRAFFIC_SOURCE = `qa-analytics-${RUN_ID}`;
const PAYMENT_DATE = new Date("2099-12-31T10:00:00.000Z");
const PAYMENT_DAY = PAYMENT_DATE.toISOString().slice(0, 10);
const PAYMENT_MONTH = PAYMENT_DAY.slice(0, 7);

let adminUserId = "";
let studentUserId = "";
let pendingPaymentId = "";

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

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

async function cleanupQaAnalyticsData() {
  await prisma.paymentTransaction.deleteMany({
    where: {
      OR: [
        { student: { email: { startsWith: "qa.analytics.student." } } },
        { subscription: { planName: { startsWith: "QA Analytics " } } },
      ],
    },
  });
  await prisma.studentSubscription.deleteMany({
    where: { planName: { startsWith: "QA Analytics " } },
  });
  await prisma.appUser.deleteMany({
    where: { email: { startsWith: "qa.analytics.student." } },
  });
  await prisma.enquiry.deleteMany({
    where: { email: { startsWith: "qa.analytics.enrol." } },
  });
  await prisma.contactLead.deleteMany({
    where: { email: { startsWith: "qa.analytics.contact." } },
  });
}

async function createAnalyticsFixtures() {
  const [admin, level] = await Promise.all([
    prisma.appUser.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    }),
    prisma.level.findFirstOrThrow({ select: { id: true } }),
  ]);
  adminUserId = admin.id;

  const student = await prisma.appUser.create({
    data: {
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
      role: UserRole.STUDENT,
      passwordHash: "test-password-hash",
      isActive: true,
      createdAt: PAYMENT_DATE,
    },
  });
  studentUserId = student.id;

  const [activeSubscription, cancelledSubscription, pastDueSubscription] = await Promise.all([
    prisma.studentSubscription.create({
      data: {
        studentId: student.id,
        planName: ACTIVE_PLAN,
        status: SubscriptionStatus.ACTIVE,
      },
    }),
    prisma.studentSubscription.create({
      data: {
        studentId: student.id,
        planName: CANCELLED_PLAN,
        status: SubscriptionStatus.CANCELLED,
      },
    }),
    prisma.studentSubscription.create({
      data: {
        studentId: student.id,
        planName: PAST_DUE_PLAN,
        status: SubscriptionStatus.PAST_DUE,
      },
    }),
  ]);

  const [, pendingPayment] = await Promise.all([
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: activeSubscription.id,
        amount: 777,
        currency: "USD",
        status: PaymentStatus.SUCCESS,
        paymentDate: PAYMENT_DATE,
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: cancelledSubscription.id,
        amount: 333,
        currency: "USD",
        status: PaymentStatus.PENDING,
        paymentDate: PAYMENT_DATE,
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: pastDueSubscription.id,
        amount: 222,
        currency: "USD",
        status: PaymentStatus.FAILED,
        paymentDate: PAYMENT_DATE,
      },
    }),
    prisma.enquiry.create({
      data: {
        referenceId: `QA-ANALYTICS-ENROL-${RUN_ID}`,
        studentName: `QA Analytics Enrol Student ${RUN_ID}`,
        ageYearLevel: "Year 8",
        subjects: ["Mathematics"],
        curriculumLevelId: level.id,
        parentGuardianName: `QA Analytics Parent ${RUN_ID}`,
        email: `qa.analytics.enrol.${RUN_ID}@example.com`,
        phoneWhatsapp: "+254700222333",
        preferredSchedule: "Weekday evenings",
        status: EnquiryStatus.CONVERTED,
        utmSource: TRAFFIC_SOURCE,
      },
    }),
    prisma.contactLead.create({
      data: {
        referenceId: `QA-ANALYTICS-LEAD-${RUN_ID}`,
        fullName: `QA Analytics Lead ${RUN_ID}`,
        email: `qa.analytics.contact.${RUN_ID}@example.com`,
        phoneWhatsapp: "+254700222444",
        studentGrade: "Year 8",
        message: "Analytics e2e lead",
        utmSource: TRAFFIC_SOURCE,
      },
    }),
  ]);
  pendingPaymentId = pendingPayment.id;
}

async function visiblePageText(page: Page) {
  return page.locator("body").innerText();
}

async function expectAnalyticsTotalRevenue(page: Page, expectedAmount: number) {
  await expect(page.getByText(formatUsd(expectedAmount))).toBeVisible();
}

test.describe("Admin BI Analytics", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaAnalyticsData();
    await createAnalyticsFixtures();
  });

  test.afterAll(async () => {
    await cleanupQaAnalyticsData();
    await prisma.$disconnect();
  });

  test("admin sees analytics metrics, raw inputs, and billing revenue side effects", async ({
    page,
  }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    const initialMetrics = await getAdvancedBIMetrics();
    await page.goto("/admin/analytics");

    await expect(page.getByRole("heading", { name: "Business Intelligence" })).toBeVisible();
    await expect(page.getByText(/track lifetime value/i)).toBeVisible();
    await expect(page.getByText("Total Revenue")).toBeVisible();
    await expect(page.getByText("Average LTV")).toBeVisible();
    await expect(page.getByText("Retention Rate", { exact: true })).toBeVisible();
    await expect(page.getByText("Active Subscriptions")).toBeVisible();
    await expect(page.getByText("Traffic Channels & Conversion")).toBeVisible();
    await expect(page.getByText("Monthly Revenue Trend")).toBeVisible();
    await expect(page.getByText(TRAFFIC_SOURCE)).toBeVisible();
    await expect(page.getByText(PAYMENT_MONTH)).toBeVisible();
    await expectAnalyticsTotalRevenue(page, initialMetrics.totalRevenue);
    await expect(page.getByText(`${initialMetrics.retentionRate.toFixed(1)}%`)).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: String(initialMetrics.activeSubscriptions),
        exact: true,
      }),
    ).toBeVisible();
    await expect(await visiblePageText(page)).not.toMatch(/NaN|Infinity|undefined/);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Business Intelligence" })).toBeVisible();
    await expect(await visiblePageText(page)).not.toMatch(/NaN|Infinity|undefined/);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/admin/analytics/inputs");
    await expect(page.getByRole("heading", { name: "Analytics Inputs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily Sign-ups" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily Revenue" })).toBeVisible();
    await expect(page.getByRole("table").filter({ hasText: "Count" })).toContainText(PAYMENT_DAY);
    await expect(page.getByRole("table").filter({ hasText: "Amount" })).toContainText(PAYMENT_DAY);
    await expect(await visiblePageText(page)).not.toMatch(/password|token|secret|NaN|Infinity/);

    await page.goto(`/admin/billing?status=PENDING&plan=${encodeURIComponent(CANCELLED_PLAN)}`);
    const pendingRow = page
      .getByRole("table", { name: /payment transactions/i })
      .locator("tbody tr")
      .filter({ hasText: CANCELLED_PLAN });
    await expect(pendingRow).toBeVisible();
    await pendingRow.locator("select").selectOption(PaymentStatus.SUCCESS);
    await expect(page.getByText(/payment status updated/i)).toBeVisible();
    await expect
      .poll(async () => {
        const payment = await prisma.paymentTransaction.findUnique({
          where: { id: pendingPaymentId },
          select: { status: true },
        });
        return payment?.status;
      })
      .toBe(PaymentStatus.SUCCESS);

    const successMetrics = await getAdvancedBIMetrics();
    await page.goto("/admin/analytics");
    await expectAnalyticsTotalRevenue(page, successMetrics.totalRevenue);

    await page.goto(`/admin/billing?status=SUCCESS&plan=${encodeURIComponent(CANCELLED_PLAN)}`);
    const successRow = page
      .getByRole("table", { name: /payment transactions/i })
      .locator("tbody tr")
      .filter({ hasText: CANCELLED_PLAN });
    await expect(successRow).toBeVisible();
    await successRow.locator("select").selectOption(PaymentStatus.FAILED);
    await expect(page.getByText(/payment status updated/i)).toBeVisible();

    const failedMetrics = await getAdvancedBIMetrics();
    await page.goto("/admin/analytics");
    await expectAnalyticsTotalRevenue(page, failedMetrics.totalRevenue);
  });

  test("guest and non-admin users cannot access analytics admin routes", async ({ page }) => {
    for (const route of ["/admin/analytics", "/admin/analytics/inputs"]) {
      await page.context().clearCookies();
      await page.goto(route);
      await expect(page).toHaveURL(/\/portal\/login/);
    }

    for (const user of [
      {
        uid: studentUserId,
        role: UserRole.STUDENT,
        email: STUDENT_EMAIL,
        fullName: STUDENT_NAME,
      },
      {
        uid: "teacher-analytics-1",
        role: UserRole.TEACHER,
        email: "fixed.teacher@uluglobalacademy.com",
        fullName: "Fixed Teacher",
      },
      {
        uid: "parent-analytics-1",
        role: UserRole.PARENT,
        email: "fixed.parent@uluglobalacademy.com",
        fullName: "Fixed Parent",
      },
    ]) {
      await setPortalSession(page, user);

      for (const route of ["/admin/analytics", "/admin/analytics/inputs"]) {
        await page.goto(route);
        await expect(page).toHaveURL(
          /\/portal\/(student|teacher|parent|unauthorized)|\/portal\/login/,
        );
      }
    }
  });
});
