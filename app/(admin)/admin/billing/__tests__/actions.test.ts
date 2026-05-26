import { PaymentStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  paymentTransaction: {
    findUnique: vi.fn(),
    update: vi.fn(),
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

type BillingActionsModule = {
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

describe("Admin billing actions audit logs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
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
