import { type Page, expect, test } from "@playwright/test";
import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
  StudentLearningStatus,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE_DOMAIN = new URL(BASE_URL).hostname;
const prisma = new PrismaClient();

const EMAIL_PREFIX = "qa.parent-billing.";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CHILD_NAME = `QA Parent Billing Child ${RUN_ID}`;
const FOREIGN_CHILD_NAME = `QA Parent Billing Foreign ${RUN_ID}`;
const INVOICE_TITLE = `QA Parent Billing Invoice ${RUN_ID}`;

let parentId = "";
let parentEmail = "";
let childId = "";
let foreignChildId = "";
let invoiceId = "";

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

async function createSessionToken() {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      authMethod: "password",
      email: parentEmail,
      exp: Date.now() + 1000 * 60 * 60,
      fullName: "QA Parent Billing",
      mfaVerified: true,
      role: UserRole.PARENT,
      uid: parentId,
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
      value: await createSessionToken(),
    },
  ]);
}

async function cleanupFixtures() {
  await prisma.paymentTransaction.deleteMany({
    where: { student: { email: { startsWith: EMAIL_PREFIX } } },
  });
  await prisma.billingInvoice.deleteMany({
    where: { student: { email: { startsWith: EMAIL_PREFIX } } },
  });
  await prisma.studentSubscription.deleteMany({
    where: { student: { email: { startsWith: EMAIL_PREFIX } } },
  });
  await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

async function createFixtures() {
  parentEmail = `${EMAIL_PREFIX}parent.${RUN_ID}@example.com`;
  const [parent, child, foreignChild] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: parentEmail,
        fullName: "QA Parent Billing",
        isActive: true,
        passwordHash: "not-used",
        role: UserRole.PARENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${EMAIL_PREFIX}child.${RUN_ID}@example.com`,
        fullName: CHILD_NAME,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
    prisma.appUser.create({
      data: {
        email: `${EMAIL_PREFIX}foreign.${RUN_ID}@example.com`,
        fullName: FOREIGN_CHILD_NAME,
        isActive: true,
        learningStatus: StudentLearningStatus.ACTIVE,
        passwordHash: "not-used",
        role: UserRole.STUDENT,
      },
    }),
  ]);
  parentId = parent.id;
  childId = child.id;
  foreignChildId = foreignChild.id;

  await prisma.appUser.update({
    data: { children: { connect: { id: child.id } } },
    where: { id: parent.id },
  });

  const subscription = await prisma.studentSubscription.create({
    data: {
      payerUserId: parent.id,
      planName: "IGCSE Monthly",
      startDate: new Date(),
      status: SubscriptionStatus.ACTIVE,
      studentId: child.id,
    },
  });
  const invoice = await prisma.billingInvoice.create({
    data: {
      amountMinor: 1200000,
      currency: "KES",
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      invoiceNumber: `INV-${RUN_ID}`,
      payerUserId: parent.id,
      status: InvoiceStatus.ISSUED,
      studentId: child.id,
      subscriptionId: subscription.id,
      title: INVOICE_TITLE,
    },
  });
  invoiceId = invoice.id;
  await prisma.billingInvoice.create({
    data: {
      amountMinor: 900000,
      currency: "KES",
      invoiceNumber: `INV-FOREIGN-${RUN_ID}`,
      status: InvoiceStatus.ISSUED,
      studentId: foreignChild.id,
      title: `Foreign ${INVOICE_TITLE}`,
    },
  });
  await prisma.paymentTransaction.create({
    data: {
      amount: 5000,
      amountMinor: 500000,
      currency: "KES",
      payerUserId: parent.id,
      provider: PaymentProvider.MANUAL_BANK_TRANSFER,
      status: PaymentStatus.SUCCEEDED,
      studentId: child.id,
      subscriptionId: subscription.id,
    },
  });
}

test.describe("Parent billing local M-Pesa workflow", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupFixtures();
    await createFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent sees only linked child billing and can complete mock M-Pesa payment", async ({
    page,
  }) => {
    await setParentSession(page);

    await page.goto(`${BASE_URL}/portal/parent/billing`);
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    await expect(page.getByText(CHILD_NAME)).toBeVisible();
    await expect(page.getByText(FOREIGN_CHILD_NAME)).toHaveCount(0);

    await page.getByRole("link", { name: "Open child billing" }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/parent/billing/${childId}`));
    await expect(page.getByText(INVOICE_TITLE)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay with M-Pesa" })).toBeVisible();

    await page.getByLabel("M-Pesa phone").fill("+254700000000");
    await page.getByRole("button", { name: "Pay with M-Pesa" }).click();
    await expect
      .poll(async () => {
        const payment = await prisma.paymentTransaction.findFirst({
          where: { invoiceId, provider: PaymentProvider.MPESA },
          select: { id: true, status: true },
        });
        return payment?.status;
      })
      .toBe(PaymentStatus.PENDING);

    await page.reload();
    await page.getByRole("button", { name: "Simulate paid callback" }).click();
    await expect
      .poll(async () => {
        const invoice = await prisma.billingInvoice.findUnique({
          where: { id: invoiceId },
          select: { status: true },
        });
        return invoice?.status;
      })
      .toBe(InvoiceStatus.PAID);

    await page.goto(`${BASE_URL}/portal/parent/billing/invoices/${invoiceId}`);
    await expect(page.getByRole("heading", { name: `INV-${RUN_ID}` })).toBeVisible();
    await expect(page.getByText(/M-Pesa receipt:/i)).toBeVisible();

    await page.goto(`${BASE_URL}/portal/parent/billing/${foreignChildId}`);
    await expect(page.getByText(FOREIGN_CHILD_NAME)).toHaveCount(0);
    await expect(page.getByText(`Foreign ${INVOICE_TITLE}`)).toHaveCount(0);
  });
});
