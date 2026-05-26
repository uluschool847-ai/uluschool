import { type Page, expect, test } from "@playwright/test";
import { PaymentStatus, SubscriptionStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STUDENT_EMAIL = `qa.billing.student.${RUN_ID}@example.com`;
const STUDENT_NAME = `QA Billing Student ${RUN_ID}`;
const ACTIVE_PLAN = `QA Billing Active ${RUN_ID}`;
const CANCELLED_PLAN = `QA Billing Cancelled ${RUN_ID}`;
const PAST_DUE_PLAN = `QA Billing Past Due ${RUN_ID}`;
const REFUND_PLAN = `QA Billing Refund ${RUN_ID}`;
let adminUserId = "";
let studentUserId = "";
let pendingPaymentId = "";
let refundPaymentId = "";

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

async function cleanupQaBillingData() {
  await prisma.paymentTransaction.deleteMany({
    where: {
      OR: [
        { student: { email: { startsWith: "qa.billing.student." } } },
        { subscription: { planName: { startsWith: "QA Billing " } } },
      ],
    },
  });
  await prisma.studentSubscription.deleteMany({
    where: { planName: { startsWith: "QA Billing " } },
  });
  await prisma.appUser.deleteMany({
    where: { email: { startsWith: "qa.billing.student." } },
  });
}

async function createBillingFixtures() {
  const admin = await prisma.appUser.findUniqueOrThrow({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  adminUserId = admin.id;

  const student = await prisma.appUser.create({
    data: {
      email: STUDENT_EMAIL,
      fullName: STUDENT_NAME,
      role: UserRole.STUDENT,
      passwordHash: "test-password-hash",
      isActive: true,
    },
  });
  studentUserId = student.id;

  const [activeSubscription, cancelledSubscription, pastDueSubscription, refundSubscription] =
    await Promise.all([
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
      prisma.studentSubscription.create({
        data: {
          studentId: student.id,
          planName: REFUND_PLAN,
          status: SubscriptionStatus.ACTIVE,
        },
      }),
    ]);

  const [, pendingPayment, , refundPayment] = await Promise.all([
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: activeSubscription.id,
        amount: 321,
        currency: "USD",
        status: PaymentStatus.SUCCESS,
        paymentDate: new Date("2026-06-01T10:00:00.000Z"),
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: cancelledSubscription.id,
        amount: 654,
        currency: "USD",
        status: PaymentStatus.PENDING,
        paymentDate: new Date("2026-06-02T10:00:00.000Z"),
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: pastDueSubscription.id,
        amount: 111,
        currency: "USD",
        status: PaymentStatus.FAILED,
        paymentDate: new Date("2026-06-03T10:00:00.000Z"),
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        subscriptionId: refundSubscription.id,
        amount: 222,
        currency: "USD",
        status: PaymentStatus.SUCCESS,
        paymentDate: new Date("2026-06-04T10:00:00.000Z"),
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        amount: 77,
        currency: "USD",
        status: PaymentStatus.PENDING,
        paymentDate: new Date("2026-06-05T10:00:00.000Z"),
      },
    }),
  ]);
  pendingPaymentId = pendingPayment.id;
  refundPaymentId = refundPayment.id;
}

function paymentTable(page: Page) {
  return page.getByRole("table", { name: /payment transactions/i });
}

function billingFilterForm(page: Page) {
  return page.locator('form[action="/admin/billing"]').first();
}

function subscriptionCard(page: Page, planName: string) {
  return page.locator("article").filter({ hasText: planName });
}

test.describe("Admin Billing", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaBillingData();
    await createBillingFixtures();
  });

  test.afterAll(async () => {
    await cleanupQaBillingData();
    await prisma.$disconnect();
  });

  test("admin filters payments and subscriptions, updates payment statuses, and sees audit side effects", async ({
    page,
  }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto("/admin/billing");
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    await expect(page.getByText(/Kenya-ready local ledger/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible();
    await expect(page.getByRole("table", { name: /payment transactions/i })).toBeVisible();
    await expect(page.getByText("No subscription")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".overflow-x-auto, .overflow-x-scroll")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/admin/billing?status=SUCCESS");
    await expect(billingFilterForm(page).locator('select[name="status"]')).toHaveValue("SUCCESS");
    await expect(paymentTable(page).getByText(ACTIVE_PLAN)).toBeVisible();
    await expect(paymentTable(page).getByText(PAST_DUE_PLAN)).toHaveCount(0);

    await page.goto("/admin/billing?status=FAILED");
    await expect(billingFilterForm(page).locator('select[name="status"]')).toHaveValue("FAILED");
    await expect(paymentTable(page).getByText(PAST_DUE_PLAN)).toBeVisible();
    await expect(paymentTable(page).getByText(ACTIVE_PLAN)).toHaveCount(0);

    await page.goto("/admin/billing?status=PENDING");
    await expect(billingFilterForm(page).locator('select[name="status"]')).toHaveValue("PENDING");
    await expect(paymentTable(page).getByText(CANCELLED_PLAN)).toBeVisible();

    await page.goto("/admin/billing?status=NOT_A_STATUS");
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    await expect(billingFilterForm(page).locator('select[name="status"]')).toHaveValue("");

    await page.goto(
      `/admin/billing?subscriptionStatus=ACTIVE&plan=${encodeURIComponent(REFUND_PLAN)}`,
    );
    await expect(billingFilterForm(page).locator('select[name="subscriptionStatus"]')).toHaveValue(
      "ACTIVE",
    );
    await expect(billingFilterForm(page).locator('input[name="plan"]')).toHaveValue(REFUND_PLAN);
    await expect(subscriptionCard(page, REFUND_PLAN)).toBeVisible();
    await expect(subscriptionCard(page, CANCELLED_PLAN)).toHaveCount(0);

    await page.goto("/admin/billing?subscriptionStatus=CANCELLED");
    await expect(subscriptionCard(page, CANCELLED_PLAN)).toBeVisible();
    await expect(subscriptionCard(page, PAST_DUE_PLAN)).toHaveCount(0);

    await page.goto("/admin/billing?subscriptionStatus=PAST_DUE");
    await expect(subscriptionCard(page, PAST_DUE_PLAN)).toBeVisible();
    await expect(subscriptionCard(page, CANCELLED_PLAN)).toHaveCount(0);

    await page.goto("/admin/billing?subscriptionStatus=NOT_A_STATUS");
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    await expect(billingFilterForm(page).locator('select[name="subscriptionStatus"]')).toHaveValue(
      "",
    );

    await page.goto("/admin/billing?plan=NO_SUCH_QA_BILLING_PLAN");
    await expect(page.getByText("No subscriptions found.")).toBeVisible();

    await page.goto(
      `/admin/billing?status=PENDING&subscriptionStatus=CANCELLED&plan=${encodeURIComponent(
        CANCELLED_PLAN,
      )}`,
    );
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

    await pendingRow.locator("select").selectOption(PaymentStatus.PENDING);
    await expect(page.getByText(/payment status updated/i)).toBeVisible();
    await pendingRow.locator("select").selectOption(PaymentStatus.FAILED);
    await expect(page.getByText(/payment status updated/i)).toBeVisible();

    await page.goto(`/admin/billing?status=SUCCESS&plan=${encodeURIComponent(REFUND_PLAN)}`);
    const refundRow = page
      .getByRole("table", { name: /payment transactions/i })
      .locator("tbody tr")
      .filter({ hasText: REFUND_PLAN });
    await expect(refundRow).toBeVisible();
    await refundRow.getByRole("button", { name: /local refund/i }).click();
    await expect(page.getByText(/local refund marker applied/i)).toBeVisible();
    await expect(refundRow.locator("select")).toHaveValue(PaymentStatus.REFUNDED);
    await expect(
      prisma.paymentTransaction.findUnique({
        where: { id: refundPaymentId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: PaymentStatus.REFUNDED });

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        action: { in: ["PAYMENT_STATUS_UPDATED", "PAYMENT_REFUNDED"] },
        targetType: "payment_transaction",
        targetId: { in: [pendingPaymentId, refundPaymentId] },
      },
      orderBy: { createdAt: "desc" },
    });
    const serializedLogs = JSON.stringify(auditLogs);
    expect(auditLogs.some((log) => log.targetId === refundPaymentId)).toBe(true);
    expect(serializedLogs).toContain(PaymentStatus.REFUNDED);
    expect(serializedLogs).not.toMatch(/password|token|secret/i);

    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: /business intelligence/i })).toBeVisible();
    await expect(page.getByText(/total revenue/i)).toBeVisible();
  });

  test("guest and non-admin users cannot access billing admin", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/billing");
    await expect(page).toHaveURL(/\/portal\/login/);

    for (const user of [
      {
        uid: studentUserId,
        role: UserRole.STUDENT,
        email: STUDENT_EMAIL,
        fullName: STUDENT_NAME,
      },
      {
        uid: "teacher-123",
        role: UserRole.TEACHER,
        email: "fixed.teacher@uluglobalacademy.com",
        fullName: "Fixed Teacher",
      },
      {
        uid: "parent-123",
        role: UserRole.PARENT,
        email: "fixed.parent@uluglobalacademy.com",
        fullName: "Fixed Parent",
      },
    ]) {
      await setPortalSession(page, user);
      await page.goto("/admin/billing");
      await expect(page).toHaveURL(/\/portal\/unauthorized|\/portal\/login/);
    }
  });
});
