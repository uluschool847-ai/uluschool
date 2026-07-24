import { type Page, expect, test } from "@playwright/test";
import { PaymentStatus, SubscriptionStatus, UserRole } from "@prisma/client";

import { createSessionToken } from "@/e2e/helpers/session";
import { prisma } from "@/lib/prisma";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL_PREFIX = "qa.billing.";
const STUDENT_EMAIL = `${EMAIL_PREFIX}student.${RUN_ID}@example.com`;
const STUDENT_NAME = `QA Billing Student ${RUN_ID}`;
const PARENT_EMAIL = `${EMAIL_PREFIX}parent.${RUN_ID}@example.com`;
const PARENT_NAME = `QA Billing Parent ${RUN_ID}`;
const ACTIVE_PLAN = `QA Billing Active ${RUN_ID}`;
const CANCELLED_PLAN = `QA Billing Cancelled ${RUN_ID}`;
const PAST_DUE_PLAN = `QA Billing Past Due ${RUN_ID}`;
const REFUND_PLAN = `QA Billing Refund ${RUN_ID}`;
const FAILED_MUTATION_PLAN = `QA Billing Failed Mutation ${RUN_ID}`;
const UI_PLAN = `QA Billing UI Plan ${RUN_ID}`;
const UI_INVOICE = `QA Billing UI Invoice ${RUN_ID}`;
const INVALID_INVOICE = `QA Billing Invalid Invoice ${RUN_ID}`;
let adminUserId = "";
let studentUserId = "";
let parentUserId = "";
let pendingPaymentId = "";
let refundPaymentId = "";
let failedMutationPaymentId = "";

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
  const [plans, invoices, payments, subscriptions] = await Promise.all([
    prisma.billingPlan.findMany({
      where: { name: { startsWith: "QA Billing UI Plan " } },
      select: { id: true },
    }),
    prisma.billingInvoice.findMany({
      where: {
        OR: [
          { title: { startsWith: "QA Billing UI Invoice " } },
          { title: { startsWith: "QA Billing Invalid Invoice " } },
          { student: { email: { startsWith: EMAIL_PREFIX } } },
        ],
      },
      select: { id: true },
    }),
    prisma.paymentTransaction.findMany({
      where: {
        OR: [
          { student: { email: { startsWith: EMAIL_PREFIX } } },
          { subscription: { planName: { startsWith: "QA Billing " } } },
        ],
      },
      select: { id: true },
    }),
    prisma.studentSubscription.findMany({
      where: { planName: { startsWith: "QA Billing " } },
      select: { id: true },
    }),
  ]);
  await prisma.adminAuditLog.deleteMany({
    where: {
      OR: [
        { targetType: "billing_plan", targetId: { in: plans.map((plan) => plan.id) } },
        { targetType: "billing_invoice", targetId: { in: invoices.map((invoice) => invoice.id) } },
        {
          targetType: "student_subscription",
          targetId: { in: subscriptions.map((subscription) => subscription.id) },
        },
        {
          targetType: "payment_transaction",
          targetId: { in: payments.map((payment) => payment.id) },
        },
      ],
    },
  });
  await prisma.paymentTransaction.deleteMany({
    where: {
      OR: [
        { student: { email: { startsWith: EMAIL_PREFIX } } },
        { subscription: { planName: { startsWith: "QA Billing " } } },
      ],
    },
  });
  await prisma.billingInvoice.deleteMany({
    where: {
      OR: [
        { title: { startsWith: "QA Billing UI Invoice " } },
        { title: { startsWith: "QA Billing Invalid Invoice " } },
        { student: { email: { startsWith: EMAIL_PREFIX } } },
      ],
    },
  });
  await prisma.studentSubscription.deleteMany({
    where: { planName: { startsWith: "QA Billing " } },
  });
  await prisma.billingPlan.deleteMany({
    where: { name: { startsWith: "QA Billing UI Plan " } },
  });
  await prisma.appUser.deleteMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
  });
}

async function createBillingFixtures() {
  const admin = await prisma.appUser.findUniqueOrThrow({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  adminUserId = admin.id;

  const [parent, student] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: PARENT_EMAIL,
        fullName: PARENT_NAME,
        role: UserRole.PARENT,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: STUDENT_EMAIL,
        fullName: STUDENT_NAME,
        role: UserRole.STUDENT,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    }),
  ]);
  await prisma.appUser.update({
    where: { id: parent.id },
    data: { children: { connect: { id: student.id } } },
  });
  parentUserId = parent.id;
  studentUserId = student.id;

  const [
    activeSubscription,
    cancelledSubscription,
    pastDueSubscription,
    refundSubscription,
    failedMutationSubscription,
  ] = await Promise.all([
    prisma.studentSubscription.create({
      data: {
        payerUserId: parent.id,
        studentId: student.id,
        planName: ACTIVE_PLAN,
        status: SubscriptionStatus.ACTIVE,
      },
    }),
    prisma.studentSubscription.create({
      data: {
        payerUserId: parent.id,
        studentId: student.id,
        planName: CANCELLED_PLAN,
        status: SubscriptionStatus.CANCELLED,
      },
    }),
    prisma.studentSubscription.create({
      data: {
        payerUserId: parent.id,
        studentId: student.id,
        planName: PAST_DUE_PLAN,
        status: SubscriptionStatus.PAST_DUE,
      },
    }),
    prisma.studentSubscription.create({
      data: {
        payerUserId: parent.id,
        studentId: student.id,
        planName: REFUND_PLAN,
        status: SubscriptionStatus.ACTIVE,
      },
    }),
    prisma.studentSubscription.create({
      data: {
        payerUserId: parent.id,
        studentId: student.id,
        planName: FAILED_MUTATION_PLAN,
        status: SubscriptionStatus.ACTIVE,
      },
    }),
  ]);

  const [, pendingPayment, , refundPayment, , failedMutationPayment] = await Promise.all([
    prisma.paymentTransaction.create({
      data: {
        payerUserId: parent.id,
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
        payerUserId: parent.id,
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
        payerUserId: parent.id,
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
        payerUserId: parent.id,
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
        payerUserId: parent.id,
        studentId: student.id,
        amount: 77,
        currency: "USD",
        status: PaymentStatus.PENDING,
        paymentDate: new Date("2026-06-05T10:00:00.000Z"),
      },
    }),
    prisma.paymentTransaction.create({
      data: {
        payerUserId: parent.id,
        studentId: student.id,
        subscriptionId: failedMutationSubscription.id,
        amount: 432,
        currency: "USD",
        status: PaymentStatus.PENDING,
        paymentDate: new Date("2026-06-06T10:00:00.000Z"),
      },
    }),
  ]);
  pendingPaymentId = pendingPayment.id;
  refundPaymentId = refundPayment.id;
  failedMutationPaymentId = failedMutationPayment.id;
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

function billingAdminForm(page: Page, heading: string) {
  return page.locator("form").filter({ hasText: heading });
}

async function verifyBillingCreateForms(page: Page) {
  const planForm = billingAdminForm(page, "Create plan");
  await planForm.getByPlaceholder("IGCSE Monthly").fill(UI_PLAN);
  await planForm.getByPlaceholder("1200000 for KES 12,000").fill("987600");
  await planForm.getByRole("button", { name: /^create plan$/i }).click();
  await expect(page.getByText(/billing plan created/i)).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.locator('select[name="planId"]')).toContainText(UI_PLAN);

  const plan = await prisma.billingPlan.findFirstOrThrow({
    where: { name: UI_PLAN },
    select: { id: true },
  });

  const subscriptionForm = billingAdminForm(page, "Assign subscription");
  await subscriptionForm.getByPlaceholder("Student user id").fill(studentUserId);
  await subscriptionForm.getByPlaceholder("Parent payer id").fill(parentUserId);
  await subscriptionForm.locator('select[name="planId"]').selectOption(plan.id);
  await expect(subscriptionForm.locator('select[name="planId"]')).toHaveValue(plan.id);
  await subscriptionForm.getByRole("button", { name: /^assign subscription$/i }).click();
  await expect(page.getByText(/subscription assigned/i)).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(subscriptionCard(page, UI_PLAN)).toBeVisible();

  const invoiceForm = billingAdminForm(page, "Issue invoice");
  await invoiceForm.getByPlaceholder("Student user id").fill(studentUserId);
  await invoiceForm.getByPlaceholder("Parent payer id").fill(parentUserId);
  await invoiceForm.getByPlaceholder("May tuition").fill(UI_INVOICE);
  await invoiceForm.getByPlaceholder("1200000").fill("987600");
  await invoiceForm.getByRole("button", { name: /^issue invoice$/i }).click();
  await expect(page.getByText(/invoice issued/i)).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByText(UI_INVOICE)).toBeVisible();

  const invoice = await prisma.billingInvoice.findFirstOrThrow({
    where: { studentId: studentUserId, title: UI_INVOICE },
    select: { id: true },
  });

  const paymentForm = billingAdminForm(page, "Record payment");
  await paymentForm.getByPlaceholder("Student user id").fill(studentUserId);
  await paymentForm.getByPlaceholder("Parent payer id").fill(parentUserId);
  await paymentForm.getByPlaceholder("Invoice id").fill(invoice.id);
  await paymentForm.getByPlaceholder("1200000").fill("987600");
  await paymentForm.locator('select[name="status"]').selectOption(PaymentStatus.PENDING);
  await paymentForm.getByRole("button", { name: /^record payment$/i }).click();
  await expect(page.getByText(/payment recorded/i)).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    paymentTable(page).locator("tbody tr").filter({ hasText: STUDENT_NAME }).first(),
  ).toBeVisible();

  const payment = await prisma.paymentTransaction.findFirstOrThrow({
    where: { amountMinor: 987600, invoiceId: invoice.id, studentId: studentUserId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const paymentStatusSelect = page.locator(`[id="payment-status-${payment.id}"]`);
  await expect(paymentStatusSelect).toHaveValue(PaymentStatus.PENDING);
  await paymentStatusSelect.selectOption(PaymentStatus.SUCCESS);
  await expect(page.getByText(/payment status updated/i)).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => {
      const [updatedPayment, updatedInvoice] = await Promise.all([
        prisma.paymentTransaction.findUnique({
          where: { id: payment.id },
          select: { status: true },
        }),
        prisma.billingInvoice.findUnique({
          where: { id: invoice.id },
          select: { status: true },
        }),
      ]);
      return `${updatedPayment?.status}:${updatedInvoice?.status}`;
    })
    .toBe(`${PaymentStatus.SUCCESS}:PAID`);

  const subscription = await prisma.studentSubscription.findFirstOrThrow({
    where: { studentId: studentUserId, planName: UI_PLAN },
    select: { id: true },
  });
  const auditLogs = await prisma.adminAuditLog.findMany({
    where: {
      action: {
        in: [
          "BILLING_PLAN_CREATED",
          "STUDENT_SUBSCRIPTION_CREATED",
          "BILLING_INVOICE_ISSUED",
          "MANUAL_PAYMENT_RECORDED",
          "PAYMENT_STATUS_UPDATED",
        ],
      },
      targetId: { in: [plan.id, subscription.id, invoice.id, payment.id] },
    },
  });

  expect(
    auditLogs.some((log) => log.action === "BILLING_PLAN_CREATED" && log.targetId === plan.id),
  ).toBe(true);
  expect(
    auditLogs.some(
      (log) => log.action === "STUDENT_SUBSCRIPTION_CREATED" && log.targetId === subscription.id,
    ),
  ).toBe(true);
  expect(
    auditLogs.some((log) => log.action === "BILLING_INVOICE_ISSUED" && log.targetId === invoice.id),
  ).toBe(true);
  expect(
    auditLogs.some(
      (log) => log.action === "MANUAL_PAYMENT_RECORDED" && log.targetId === payment.id,
    ),
  ).toBe(true);
  expect(
    auditLogs.some((log) => log.action === "PAYMENT_STATUS_UPDATED" && log.targetId === payment.id),
  ).toBe(true);

  await setPortalSession(page, {
    uid: parentUserId,
    role: UserRole.PARENT,
    email: PARENT_EMAIL,
    fullName: PARENT_NAME,
  });
  await page.goto("/portal/parent/billing");
  await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
  const parentChildCard = page.locator("article").filter({ hasText: STUDENT_NAME });
  await expect(parentChildCard).toBeVisible();
  await expect(parentChildCard).toContainText(UI_PLAN);
  await expect(parentChildCard).toContainText("Paid invoices");
  await expect(parentChildCard).toContainText(/9,876\.00/);

  await page.goto(`/portal/parent/billing/${studentUserId}`);
  await expect(page.getByRole("heading", { name: `Billing for ${STUDENT_NAME}` })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: UI_PLAN })).toBeVisible();
  const parentInvoiceCard = page.locator("article").filter({ hasText: UI_INVOICE });
  await expect(parentInvoiceCard).toBeVisible();
  await expect(parentInvoiceCard).toContainText("PAID");
  const parentPaymentCard = page
    .locator("article")
    .filter({ hasText: /9,876\.00/ })
    .filter({ hasText: PaymentStatus.SUCCESS });
  await expect(parentPaymentCard).toBeVisible();

  await setPortalSession(page, {
    uid: adminUserId,
    role: UserRole.ADMIN,
    email: ADMIN_EMAIL,
    fullName: "Fixed Admin",
  });
}

async function verifyInvalidBillingInputRejected(page: Page) {
  await page.goto("/admin/billing");
  const invoiceAuditLogTextBefore = JSON.stringify(
    await prisma.adminAuditLog.findMany({
      where: {
        action: "BILLING_INVOICE_ISSUED",
        targetType: "billing_invoice",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
  expect(invoiceAuditLogTextBefore).not.toContain(INVALID_INVOICE);

  const invoiceForm = billingAdminForm(page, "Issue invoice");
  await invoiceForm.getByPlaceholder("Student user id").fill(studentUserId);
  await invoiceForm.getByPlaceholder("Parent payer id").fill(parentUserId);
  await invoiceForm.getByPlaceholder("May tuition").fill(INVALID_INVOICE);
  await invoiceForm.getByPlaceholder("1200000").fill("-1");
  await invoiceForm.getByRole("button", { name: /^issue invoice$/i }).click();
  await page.waitForURL(/billingError=/);
  await expect(page.locator('main [role="alert"]')).toBeVisible();
  await expect(page.getByText(INVALID_INVOICE)).toHaveCount(0);
  await expect(
    prisma.billingInvoice.count({
      where: { studentId: studentUserId, title: INVALID_INVOICE },
    }),
  ).resolves.toBe(0);
  const invoiceAuditLogTextAfter = JSON.stringify(
    await prisma.adminAuditLog.findMany({
      where: {
        action: "BILLING_INVOICE_ISSUED",
        targetType: "billing_invoice",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
  expect(invoiceAuditLogTextAfter).not.toContain(INVALID_INVOICE);
}

async function verifyFailedPaymentMutationRollsBack(page: Page) {
  await page.goto(`/admin/billing?status=PENDING&plan=${encodeURIComponent(FAILED_MUTATION_PLAN)}`);
  const failedStatusSelect = page.locator(`[id="payment-status-${failedMutationPaymentId}"]`);
  await expect(failedStatusSelect).toHaveValue(PaymentStatus.PENDING);
  const auditLogsBefore = await prisma.adminAuditLog.count({
    where: {
      action: "PAYMENT_STATUS_UPDATED",
      targetId: failedMutationPaymentId,
      targetType: "payment_transaction",
    },
  });

  await prisma.paymentTransaction.delete({ where: { id: failedMutationPaymentId } });
  await failedStatusSelect.selectOption(PaymentStatus.SUCCESS);
  await expect(
    page.locator('main [role="alert"]').filter({ hasText: /payment transaction not found/i }),
  ).toBeVisible({ timeout: 30000 });
  await expect(failedStatusSelect).toHaveValue(PaymentStatus.PENDING);
  await expect(
    prisma.paymentTransaction.findUnique({
      where: { id: failedMutationPaymentId },
      select: { id: true },
    }),
  ).resolves.toBeNull();
  await expect(
    prisma.adminAuditLog.count({
      where: {
        action: "PAYMENT_STATUS_UPDATED",
        targetId: failedMutationPaymentId,
        targetType: "payment_transaction",
      },
    }),
  ).resolves.toBe(auditLogsBefore);
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

    await verifyBillingCreateForms(page);
    await verifyInvalidBillingInputRejected(page);
    await verifyFailedPaymentMutationRollsBack(page);

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
