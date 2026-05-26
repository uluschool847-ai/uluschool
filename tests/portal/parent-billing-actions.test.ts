import { UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createMockMpesaPaymentForParentMock = vi.hoisted(() => vi.fn());
const simulateMockMpesaCallbackForParentMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/repositories/billing-repository", () => ({
  createMockMpesaPaymentForParent: createMockMpesaPaymentForParentMock,
  simulateMockMpesaCallbackForParent: simulateMockMpesaCallbackForParentMock,
}));

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

async function loadActions() {
  return import("@/app/portal/parent/actions/billing-actions");
}

describe("parent billing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts mock M-Pesa payment with server-side parent id and revalidates billing paths", async () => {
    const { startMockMpesaPaymentAction } = await loadActions();

    await startMockMpesaPaymentAction(
      formData({
        amountMinor: "1200000",
        invoiceId: "invoice-1",
        phoneNumber: "+254700000000",
        studentId: "student-1",
      }),
    );

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(createMockMpesaPaymentForParentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 1200000,
        invoiceId: "invoice-1",
        parentId: "parent-1",
        phoneNumber: "+254700000000",
        studentId: "student-1",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent/billing");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent/billing/student-1");
  });

  it("simulates callback through parent-scoped repository without trusting client parent id", async () => {
    const { simulateMockMpesaCallbackAction } = await loadActions();

    await simulateMockMpesaCallbackAction(
      formData({
        parentId: "foreign-parent",
        paymentId: "payment-1",
        success: "true",
      }),
    );

    expect(simulateMockMpesaCallbackForParentMock).toHaveBeenCalledWith("parent-1", {
      paymentId: "payment-1",
      success: true,
    });
  });

  it("does not call repository for invalid payment input", async () => {
    const { startMockMpesaPaymentAction } = await loadActions();

    await startMockMpesaPaymentAction(
      formData({
        amountMinor: "0",
        phoneNumber: "x",
        studentId: "",
      }),
    );

    expect(createMockMpesaPaymentForParentMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
