import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  type Prisma,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type BillingDatabase = typeof prisma | Prisma.TransactionClient;

export const BILLING_PRIMARY_CURRENCY = "KES";
export const PAYMENT_SUCCEEDED_STATUSES: PaymentStatus[] = [
  PaymentStatus.SUCCESS,
  PaymentStatus.SUCCEEDED,
];

export type BillingFilters = {
  status?: PaymentStatus;
  subscriptionStatus?: SubscriptionStatus;
  invoiceStatus?: InvoiceStatus;
  provider?: PaymentProvider;
  plan?: string;
};

export type CreateBillingPlanInput = {
  name: string;
  amountMinor: number;
  currency?: string;
  cycle?: "MONTHLY" | "TERMLY" | "ONE_TIME";
  description?: string;
  levelId?: string;
  isActive?: boolean;
  displayOrder?: number;
};

export type IssueInvoiceInput = {
  studentId: string;
  payerUserId?: string;
  subscriptionId?: string;
  planId?: string;
  title: string;
  description?: string;
  amountMinor: number;
  currency?: string;
  dueDate?: Date;
};

export type CreateManualPaymentInput = {
  studentId: string;
  payerUserId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  amountMinor: number;
  currency?: string;
  provider?: PaymentProvider;
  status?: PaymentStatus;
  phoneNumber?: string;
  accountReference?: string;
};

function normalizeCurrency(currency?: string) {
  return (currency ?? BILLING_PRIMARY_CURRENCY).trim().toUpperCase() || BILLING_PRIMARY_CURRENCY;
}

function assertAmountMinor(amountMinor: number) {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("Amount must be a non-negative integer minor unit.");
  }
}

function amountToLegacyFloat(amountMinor: number) {
  return amountMinor / 100;
}

function buildInvoiceNumber() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${suffix}`;
}

function buildMpesaReference() {
  return Math.random().toString(36).slice(2, 12).toUpperCase();
}

export function formatMoneyMinor(amountMinor: number, currency = BILLING_PRIMARY_CURRENCY) {
  return new Intl.NumberFormat("en-KE", {
    currency,
    style: "currency",
  }).format(amountMinor / 100);
}

async function parentOwnsStudent(
  parentId: string,
  studentId: string,
  database: BillingDatabase = prisma,
) {
  const child = await database.appUser.findFirst({
    where: {
      id: studentId,
      role: UserRole.STUDENT,
      parents: { some: { id: parentId, role: UserRole.PARENT } },
    },
    select: { id: true },
  });

  return Boolean(child);
}

async function assertParentOwnsStudent(
  parentId: string,
  studentId: string,
  database: BillingDatabase = prisma,
) {
  if (!(await parentOwnsStudent(parentId, studentId, database))) {
    throw new Error("Linked child not found.");
  }
}

async function listBillingPlans(filters: { activeOnly?: boolean } = {}) {
  return prisma.billingPlan.findMany({
    where: filters.activeOnly ? { isActive: true } : undefined,
    include: { level: { select: { id: true, name: true } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
}

export async function createBillingPlan(
  input: CreateBillingPlanInput,
  database: BillingDatabase = prisma,
) {
  const name = input.name.trim();
  if (!name) throw new Error("Plan name is required.");
  assertAmountMinor(input.amountMinor);

  return database.billingPlan.create({
    data: {
      amountMinor: input.amountMinor,
      currency: normalizeCurrency(input.currency),
      cycle: input.cycle ?? "MONTHLY",
      description: input.description?.trim() || null,
      displayOrder: input.displayOrder ?? 0,
      isActive: input.isActive ?? true,
      levelId: input.levelId || null,
      name,
    },
  });
}

export async function createSubscriptionForStudent(
  input: {
    studentId: string;
    payerUserId?: string;
    planId?: string;
    planName?: string;
    status?: SubscriptionStatus;
    startDate?: Date;
    endDate?: Date | null;
  },
  database: BillingDatabase = prisma,
) {
  const plan = input.planId
    ? await database.billingPlan.findUnique({ where: { id: input.planId } })
    : null;
  const explicitPlanName = input.planName?.trim();
  const planName = explicitPlanName || plan?.name.trim() || "";
  if (!planName) throw new Error("Plan name is required.");

  return database.studentSubscription.create({
    data: {
      endDate: input.endDate ?? null,
      payerUserId: input.payerUserId || null,
      planId: input.planId || null,
      planName,
      startDate: input.startDate ?? new Date(),
      status: input.status ?? SubscriptionStatus.ACTIVE,
      studentId: input.studentId,
    },
    include: {
      payer: { select: { id: true, fullName: true, email: true } },
      plan: true,
      student: { select: { id: true, fullName: true, email: true } },
    },
  });
}

export async function issueInvoice(input: IssueInvoiceInput, database: BillingDatabase = prisma) {
  const title = input.title.trim();
  if (!title) throw new Error("Invoice title is required.");
  assertAmountMinor(input.amountMinor);

  return database.billingInvoice.create({
    data: {
      amountMinor: input.amountMinor,
      currency: normalizeCurrency(input.currency),
      description: input.description?.trim() || null,
      dueDate: input.dueDate ?? null,
      invoiceNumber: buildInvoiceNumber(),
      payerUserId: input.payerUserId || null,
      planId: input.planId || null,
      status: InvoiceStatus.ISSUED,
      studentId: input.studentId,
      subscriptionId: input.subscriptionId || null,
      title,
    },
    include: {
      payments: true,
      plan: true,
      student: { select: { id: true, fullName: true, email: true } },
      payer: { select: { id: true, fullName: true, email: true } },
    },
  });
}

async function updateInvoiceStatusAfterPayment(
  invoiceId: string | null | undefined,
  paymentStatus: PaymentStatus,
  database: BillingDatabase,
) {
  if (!invoiceId || !PAYMENT_SUCCEEDED_STATUSES.includes(paymentStatus)) return;

  await database.billingInvoice.update({
    where: { id: invoiceId },
    data: {
      paidAt: new Date(),
      status: InvoiceStatus.PAID,
    },
  });
}

export async function createManualPayment(
  input: CreateManualPaymentInput,
  database: BillingDatabase = prisma,
) {
  assertAmountMinor(input.amountMinor);
  const currency = normalizeCurrency(input.currency);
  const status = input.status ?? PaymentStatus.PENDING;

  const payment = await database.paymentTransaction.create({
    data: {
      accountReference: input.accountReference?.trim() || null,
      amount: amountToLegacyFloat(input.amountMinor),
      amountMinor: input.amountMinor,
      currency,
      invoiceId: input.invoiceId || null,
      payerUserId: input.payerUserId || null,
      phoneNumber: input.phoneNumber?.trim() || null,
      provider: input.provider ?? PaymentProvider.MANUAL_BANK_TRANSFER,
      status,
      studentId: input.studentId,
      subscriptionId: input.subscriptionId || null,
    },
    include: {
      invoice: true,
      payer: { select: { id: true, fullName: true, email: true } },
      student: { select: { id: true, fullName: true, email: true } },
      subscription: true,
    },
  });

  await updateInvoiceStatusAfterPayment(input.invoiceId, status, database);
  return payment;
}

export async function createMockMpesaPaymentForParent(input: {
  parentId: string;
  studentId: string;
  invoiceId?: string;
  subscriptionId?: string;
  amountMinor: number;
  phoneNumber: string;
  accountReference?: string;
}) {
  await assertParentOwnsStudent(input.parentId, input.studentId);
  const checkoutId = `mock-checkout-${buildMpesaReference()}`;
  const merchantId = `mock-merchant-${buildMpesaReference()}`;

  return createManualPayment({
    accountReference: input.accountReference ?? input.invoiceId ?? input.studentId,
    amountMinor: input.amountMinor,
    invoiceId: input.invoiceId,
    payerUserId: input.parentId,
    phoneNumber: input.phoneNumber,
    provider: PaymentProvider.MPESA,
    status: PaymentStatus.PENDING,
    studentId: input.studentId,
    subscriptionId: input.subscriptionId,
  }).then((payment) =>
    prisma.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        providerCheckoutRequestId: checkoutId,
        providerMerchantRequestId: merchantId,
      },
      include: {
        invoice: true,
        payer: { select: { id: true, fullName: true, email: true } },
        student: { select: { id: true, fullName: true, email: true } },
        subscription: true,
      },
    }),
  );
}

async function simulateMockMpesaCallback(input: {
  paymentId: string;
  success: boolean;
  receiptNumber?: string;
  failureReason?: string;
  payload?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentTransaction.findUnique({ where: { id: input.paymentId } });
    if (!payment || payment.provider !== PaymentProvider.MPESA) {
      throw new Error("M-Pesa payment not found.");
    }

    const status = input.success ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
    const updated = await tx.paymentTransaction.update({
      where: { id: input.paymentId },
      data: {
        callbackPayload: input.payload ?? {
          failureReason: input.failureReason ?? null,
          success: input.success,
        },
        mpesaReceiptNumber: input.success
          ? (input.receiptNumber ?? `MPESA-${buildMpesaReference()}`)
          : null,
        status,
      },
    });
    await updateInvoiceStatusAfterPayment(updated.invoiceId, status, tx);
    return updated;
  });
}

export async function simulateMockMpesaCallbackForParent(
  parentId: string,
  input: {
    paymentId: string;
    success: boolean;
    receiptNumber?: string;
    failureReason?: string;
    payload?: Prisma.InputJsonValue;
  },
) {
  const payment = await prisma.paymentTransaction.findUnique({
    where: { id: input.paymentId },
    select: { studentId: true },
  });
  if (!payment) throw new Error("Payment transaction not found.");
  await assertParentOwnsStudent(parentId, payment.studentId);
  return simulateMockMpesaCallback(input);
}

export async function refundPayment(paymentId: string, database: BillingDatabase = prisma) {
  const payment = await database.paymentTransaction.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment transaction not found.");
  if (!PAYMENT_SUCCEEDED_STATUSES.includes(payment.status)) {
    throw new Error("Only successful payments can be refunded.");
  }

  return database.paymentTransaction.update({
    where: { id: paymentId },
    data: {
      refundedAt: new Date(),
      status: PaymentStatus.REFUNDED,
    },
  });
}

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  database: BillingDatabase = prisma,
) {
  const payment = await database.paymentTransaction.update({
    where: { id: paymentId },
    data: {
      refundedAt: status === PaymentStatus.REFUNDED ? new Date() : undefined,
      status,
    },
  });
  await updateInvoiceStatusAfterPayment(payment.invoiceId, status, database);
  return payment;
}

export async function listAdminBillingData(filters: BillingFilters = {}) {
  const paymentWhere: Prisma.PaymentTransactionWhereInput = {};
  const subscriptionWhere: Prisma.StudentSubscriptionWhereInput = {};
  const invoiceWhere: Prisma.BillingInvoiceWhereInput = {};

  if (filters.status) paymentWhere.status = filters.status;
  if (filters.provider) paymentWhere.provider = filters.provider;
  if (filters.subscriptionStatus) subscriptionWhere.status = filters.subscriptionStatus;
  if (filters.invoiceStatus) invoiceWhere.status = filters.invoiceStatus;
  if (filters.plan?.trim()) {
    subscriptionWhere.planName = { contains: filters.plan.trim(), mode: "insensitive" };
    invoiceWhere.OR = [
      { title: { contains: filters.plan.trim(), mode: "insensitive" } },
      { plan: { name: { contains: filters.plan.trim(), mode: "insensitive" } } },
    ];
  }

  const [plans, payments, subscriptions, invoices] = await Promise.all([
    listBillingPlans(),
    prisma.paymentTransaction.findMany({
      where: paymentWhere,
      include: {
        invoice: true,
        payer: { select: { id: true, fullName: true, email: true } },
        student: { select: { id: true, fullName: true, email: true } },
        subscription: { select: { id: true, planName: true } },
      },
      orderBy: { paymentDate: "desc" },
      take: 50,
    }),
    prisma.studentSubscription.findMany({
      where: subscriptionWhere,
      include: {
        payer: { select: { id: true, fullName: true, email: true } },
        plan: true,
        student: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.billingInvoice.findMany({
      where: invoiceWhere,
      include: {
        payments: true,
        payer: { select: { id: true, fullName: true, email: true } },
        plan: true,
        student: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 50,
    }),
  ]);

  return { invoices, payments, plans, subscriptions };
}

export async function listParentBillingOverview(parentId: string) {
  const children = await prisma.appUser.findMany({
    where: { parents: { some: { id: parentId } }, role: UserRole.STUDENT },
    select: { id: true, email: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const childIds = children.map((child) => child.id);

  if (childIds.length === 0) {
    return { children: [] };
  }

  const [subscriptions, invoices, payments] = await Promise.all([
    prisma.studentSubscription.findMany({
      where: { studentId: { in: childIds } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingInvoice.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }),
    prisma.paymentTransaction.findMany({
      where: { studentId: { in: childIds } },
      orderBy: { paymentDate: "desc" },
      take: 100,
    }),
  ]);

  return {
    children: children.map((child) => ({
      ...child,
      invoices: invoices.filter((invoice) => invoice.studentId === child.id),
      payments: payments.filter((payment) => payment.studentId === child.id),
      subscriptions: subscriptions.filter((subscription) => subscription.studentId === child.id),
    })),
  };
}

export async function getParentChildBilling(parentId: string, studentId: string) {
  if (!(await parentOwnsStudent(parentId, studentId))) {
    return null;
  }
  const [student, subscriptions, invoices, payments] = await Promise.all([
    prisma.appUser.findUnique({
      where: { id: studentId },
      select: { id: true, email: true, fullName: true },
    }),
    prisma.studentSubscription.findMany({
      where: { studentId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingInvoice.findMany({
      where: { studentId },
      include: { payments: true, plan: true },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.paymentTransaction.findMany({
      where: { studentId },
      include: { invoice: true, subscription: true },
      orderBy: { paymentDate: "desc" },
    }),
  ]);

  return { invoices, payments, student, subscriptions };
}

export async function getInvoiceForParent(parentId: string, invoiceId: string) {
  const invoice = await prisma.billingInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: { orderBy: { paymentDate: "desc" } },
      plan: true,
      student: { select: { id: true, email: true, fullName: true } },
      subscription: true,
    },
  });
  if (!invoice) return null;

  if (!(await parentOwnsStudent(parentId, invoice.studentId))) {
    return null;
  }
  return invoice;
}
