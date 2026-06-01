import { InvoiceStatus, PaymentProvider, PaymentStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
  appUser: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  billingInvoice: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  billingPlan: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  paymentTransaction: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  studentSubscription: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

async function loadRepository() {
  const specifier = "@/lib/repositories/billing-repository";
  return import(/* @vite-ignore */ specifier);
}

describe("billing-repository Kenya local billing contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates KES billing plans with integer minor units", async () => {
    prismaMock.billingPlan.create.mockResolvedValueOnce({ id: "plan-1" });
    const { createBillingPlan } = await loadRepository();

    await createBillingPlan({ amountMinor: 1_200_000, name: "IGCSE Monthly" });

    expect(prismaMock.billingPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amountMinor: 1_200_000,
        currency: "KES",
        name: "IGCSE Monthly",
      }),
    });
  });

  it("uses the selected plan name when subscription fallback plan name is blank", async () => {
    prismaMock.billingPlan.findUnique.mockResolvedValueOnce({
      id: "plan-1",
      name: "IGCSE Monthly",
    });
    prismaMock.studentSubscription.create.mockResolvedValueOnce({ id: "subscription-1" });
    const { createSubscriptionForStudent } = await loadRepository();

    await createSubscriptionForStudent({
      planId: "plan-1",
      planName: "",
      studentId: "student-1",
    });

    expect(prismaMock.studentSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planId: "plan-1",
          planName: "IGCSE Monthly",
          studentId: "student-1",
        }),
      }),
    );
  });

  it("enforces parent-child ownership before starting a mock M-Pesa payment", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "student-1" });
    prismaMock.paymentTransaction.create.mockResolvedValueOnce({
      id: "payment-1",
      invoiceId: "invoice-1",
      status: PaymentStatus.PENDING,
    });
    prismaMock.paymentTransaction.update.mockResolvedValueOnce({ id: "payment-1" });
    const { createMockMpesaPaymentForParent } = await loadRepository();

    await createMockMpesaPaymentForParent({
      amountMinor: 1_200_000,
      invoiceId: "invoice-1",
      parentId: "parent-1",
      phoneNumber: "+254700000000",
      studentId: "student-1",
    });

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "student-1",
          parents: { some: { id: "parent-1", role: UserRole.PARENT } },
        }),
      }),
    );
    expect(prismaMock.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountMinor: 1_200_000,
          currency: "KES",
          payerUserId: "parent-1",
          provider: PaymentProvider.MPESA,
          status: PaymentStatus.PENDING,
        }),
      }),
    );
  });

  it("rejects mock M-Pesa payment for unlinked children", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);
    const { createMockMpesaPaymentForParent } = await loadRepository();

    await expect(
      createMockMpesaPaymentForParent({
        amountMinor: 1_200_000,
        parentId: "parent-1",
        phoneNumber: "+254700000000",
        studentId: "foreign-student",
      }),
    ).rejects.toThrow(/linked child/i);
    expect(prismaMock.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it("marks invoice paid when an M-Pesa callback succeeds", async () => {
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      studentId: "student-1",
    });
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "student-1" });
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      invoiceId: "invoice-1",
      provider: PaymentProvider.MPESA,
    });
    prismaMock.paymentTransaction.update.mockResolvedValueOnce({
      id: "payment-1",
      invoiceId: "invoice-1",
      status: PaymentStatus.SUCCEEDED,
    });
    const { simulateMockMpesaCallbackForParent } = await loadRepository();

    await simulateMockMpesaCallbackForParent("parent-1", { paymentId: "payment-1", success: true });

    expect(prismaMock.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mpesaReceiptNumber: expect.stringMatching(/MPESA-/),
          status: PaymentStatus.SUCCEEDED,
        }),
      }),
    );
    expect(prismaMock.billingInvoice.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: InvoiceStatus.PAID }),
      where: { id: "invoice-1" },
    });
  });

  it("uses REFUNDED instead of FAILED for local refund markers", async () => {
    prismaMock.paymentTransaction.findUnique.mockResolvedValueOnce({
      id: "payment-1",
      status: PaymentStatus.SUCCEEDED,
    });
    prismaMock.paymentTransaction.update.mockResolvedValueOnce({ id: "payment-1" });
    const { refundPayment } = await loadRepository();

    await refundPayment("payment-1");

    expect(prismaMock.paymentTransaction.update).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: PaymentStatus.REFUNDED }),
      where: { id: "payment-1" },
    });
  });

  it("returns null for unlinked parent child billing reads", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);
    const { getParentChildBilling } = await loadRepository();

    await expect(getParentChildBilling("parent-1", "foreign-student")).resolves.toBeNull();
    expect(prismaMock.studentSubscription.findMany).not.toHaveBeenCalled();
    expect(prismaMock.billingInvoice.findMany).not.toHaveBeenCalled();
    expect(prismaMock.paymentTransaction.findMany).not.toHaveBeenCalled();
  });

  it("returns null for unlinked parent invoice reads", async () => {
    prismaMock.billingInvoice.findUnique.mockResolvedValueOnce({
      id: "invoice-1",
      studentId: "foreign-student",
    });
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);
    const { getInvoiceForParent } = await loadRepository();

    await expect(getInvoiceForParent("parent-1", "invoice-1")).resolves.toBeNull();
  });
});
