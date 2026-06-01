import {
  BillingCycle,
  PaymentProvider,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  billingInvoice: {
    create: vi.fn(),
    update: vi.fn(),
  },
  billingPlan: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  paymentTransaction: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  studentSubscription: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

type BillingActionsModule = {
  createBillingPlanAction: (formData: FormData) => Promise<void>;
  createManualPaymentAction: (formData: FormData) => Promise<void>;
  createSubscriptionAction: (formData: FormData) => Promise<void>;
  issueInvoiceAction: (formData: FormData) => Promise<void>;
  updatePaymentStatusAction: (input: { paymentId: string; status: string }) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
  refundPaymentAction: (input: { paymentId: string }) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    message?: string;
  }>;
};

async function loadBillingActions() {
  const specifier = "@/app/(admin)/admin/billing/actions";
  return import(/* @vite-ignore */ specifier) as Promise<BillingActionsModule>;
}

function formData(input: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) {
    data.set(key, value);
  }
  return data;
}

function expectBillingPathsRevalidated() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/billing");
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/analytics");
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/analytics/inputs");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent/billing");
}

describe("Admin billing actions audit logs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  it("creates a billing plan with audit, revalidation, and admin feedback", async () => {
    prismaMock.billingPlan.create.mockResolvedValueOnce({
      amountMinor: 1200000,
      currency: "KES",
      cycle: BillingCycle.MONTHLY,
      id: "plan-1",
      name: "IGCSE Monthly",
    });

    const { createBillingPlanAction } = await loadBillingActions();
    await createBillingPlanAction(
      formData({
        amountMinor: "1200000",
        currency: "KES",
        cycle: BillingCycle.MONTHLY,
        name: "IGCSE Monthly",
      }),
    );

    expect(prismaMock.billingPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountMinor: 1200000,
          currency: "KES",
          cycle: BillingCycle.MONTHLY,
          name: "IGCSE Monthly",
        }),
      }),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BILLING_PLAN_CREATED",
        adminUserId: "admin-1",
        targetId: "plan-1",
        targetType: "billing_plan",
      }),
      prismaMock,
    );
    expectBillingPathsRevalidated();
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/billing?billingMessage=Billing+plan+created.",
    );
  });

  it("creates subscriptions, invoices, and manual payments with feedback and audit logs", async () => {
    prismaMock.billingPlan.findUnique.mockResolvedValueOnce({
      id: "plan-1",
      name: "IGCSE Monthly",
    });
    prismaMock.studentSubscription.create.mockResolvedValueOnce({
      id: "subscription-1",
      planName: "IGCSE Monthly",
      studentId: "student-1",
    });
    prismaMock.billingInvoice.create.mockResolvedValueOnce({
      id: "invoice-1",
      studentId: "student-1",
      title: "May tuition",
    });
    prismaMock.paymentTransaction.create.mockResolvedValueOnce({
      id: "payment-1",
      status: PaymentStatus.SUCCEEDED,
      studentId: "student-1",
    });

    const { createManualPaymentAction, createSubscriptionAction, issueInvoiceAction } =
      await loadBillingActions();

    await createSubscriptionAction(
      formData({
        planId: "plan-1",
        status: SubscriptionStatus.ACTIVE,
        studentId: "student-1",
      }),
    );
    await issueInvoiceAction(
      formData({
        amountMinor: "1200000",
        currency: "KES",
        studentId: "student-1",
        title: "May tuition",
      }),
    );
    await createManualPaymentAction(
      formData({
        amountMinor: "1200000",
        currency: "KES",
        provider: PaymentProvider.MANUAL_BANK_TRANSFER,
        status: PaymentStatus.SUCCEEDED,
        studentId: "student-1",
      }),
    );

    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "STUDENT_SUBSCRIPTION_CREATED",
        targetId: "subscription-1",
        targetType: "student_subscription",
      }),
      prismaMock,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BILLING_INVOICE_ISSUED",
        targetId: "invoice-1",
        targetType: "billing_invoice",
      }),
      prismaMock,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "MANUAL_PAYMENT_RECORDED",
        targetId: "payment-1",
        targetType: "payment_transaction",
      }),
      prismaMock,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/billing?billingMessage=Subscription+assigned.",
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin/billing?billingMessage=Invoice+issued.");
    expect(redirectMock).toHaveBeenCalledWith("/admin/billing?billingMessage=Payment+recorded.");
  });

  it("redirects with validation feedback and does not audit invalid billing plan creation", async () => {
    const { createBillingPlanAction } = await loadBillingActions();

    await createBillingPlanAction(
      formData({
        amountMinor: "1200000",
        currency: "KES",
        cycle: BillingCycle.MONTHLY,
        name: "   ",
      }),
    );

    expect(prismaMock.billingPlan.create).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("billingError="));
  });

  it("does not revalidate or write success audit when billing plan mutation fails", async () => {
    prismaMock.billingPlan.create.mockRejectedValueOnce(new Error("Database unavailable"));
    const { createBillingPlanAction } = await loadBillingActions();

    await createBillingPlanAction(
      formData({
        amountMinor: "1200000",
        currency: "KES",
        cycle: BillingCycle.MONTHLY,
        name: "IGCSE Monthly",
      }),
    );

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/admin/billing?billingError=Database+unavailable");
  });

  it("writes an audit log with before and after values when admin changes payment status", async () => {
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.PENDING,
    });
    prismaMock.paymentTransaction.update.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.SUCCESS,
    });

    const { updatePaymentStatusAction } = await loadBillingActions();
    const result = await updatePaymentStatusAction({
      paymentId: "payment-1",
      status: PaymentStatus.SUCCESS,
    });

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(prismaMock.paymentTransaction.findUnique).toHaveBeenCalledWith({
      where: { id: "payment-1" },
    });
    expect(prismaMock.paymentTransaction.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: PaymentStatus.SUCCESS },
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "PAYMENT_STATUS_UPDATED",
        targetType: "payment_transaction",
        targetId: "payment-1",
        before: expect.objectContaining({ status: PaymentStatus.PENDING }),
        after: expect.objectContaining({ status: PaymentStatus.SUCCESS }),
        meta: expect.objectContaining({
          actorRole: "ADMIN",
          studentId: "student-1",
          subscriptionId: "subscription-1",
        }),
      }),
      prismaMock,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/billing");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/analytics");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/analytics/inputs");
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("refund action locally marks payment as refunded and writes a refund audit log", async () => {
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.SUCCESS,
    });
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.SUCCESS,
    });
    prismaMock.paymentTransaction.update.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.REFUNDED,
    });

    const { refundPaymentAction } = await loadBillingActions();
    const result = await refundPaymentAction({ paymentId: "payment-1" });

    expect(prismaMock.paymentTransaction.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: expect.objectContaining({ status: PaymentStatus.REFUNDED }),
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_REFUNDED",
        targetType: "payment_transaction",
        targetId: "payment-1",
        before: { status: PaymentStatus.SUCCESS },
        after: { status: PaymentStatus.REFUNDED },
        meta: expect.objectContaining({
          paymentId: "payment-1",
          studentId: "student-1",
          subscriptionId: "subscription-1",
        }),
      }),
      prismaMock,
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/local refund marker/i),
      }),
    );
  });

  it("does not write an audit log when payment status validation fails", async () => {
    const { updatePaymentStatusAction } = await loadBillingActions();
    const result = await updatePaymentStatusAction({
      paymentId: "payment-1",
      status: "NOT_A_STATUS",
    });

    expect(prismaMock.paymentTransaction.update).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("does not write an audit log when payment status mutation fails", async () => {
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.PENDING,
    });
    prismaMock.paymentTransaction.update.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updatePaymentStatusAction } = await loadBillingActions();
    const result = await updatePaymentStatusAction({
      paymentId: "payment-1",
      status: PaymentStatus.SUCCESS,
    });

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("fails the payment status transaction when audit logging fails", async () => {
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.PENDING,
    });
    prismaMock.paymentTransaction.update.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
      subscriptionId: "subscription-1",
      status: PaymentStatus.SUCCESS,
    });
    createAdminAuditLogMock.mockRejectedValueOnce(new Error("Audit unavailable"));

    const { updatePaymentStatusAction } = await loadBillingActions();
    const result = await updatePaymentStatusAction({
      paymentId: "payment-1",
      status: PaymentStatus.SUCCESS,
    });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.paymentTransaction.update).toHaveBeenCalled();
    expect(createAdminAuditLogMock).toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });
});
