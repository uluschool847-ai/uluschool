import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updatePaymentStatusActionMock = vi.hoisted(() => vi.fn());
const refundPaymentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/billing/actions", () => ({
  updatePaymentStatusAction: updatePaymentStatusActionMock,
  refundPaymentAction: refundPaymentActionMock,
}));

import { PaymentTable } from "@/components/admin/billing/PaymentTable";

const payments = [
  {
    id: "pay-1",
    amount: 10,
    currency: "USD",
    status: "SUCCESS" as const,
    paymentDate: "2026-05-01",
    student: { fullName: "Student A", email: "a@test.com" },
    subscription: { planName: "Basic" },
  },
];

describe("Payment table feedback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a loading-disabled state while refund is pending", async () => {
    vi.useFakeTimers();
    refundPaymentActionMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 10_000)),
    );
    render(<PaymentTable payments={payments} />);
    fireEvent.click(screen.getByRole("button", { name: /refund/i }));
    expect(
      (screen.getByRole("button", { name: /local refund/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows user-visible error feedback when payment status update fails", async () => {
    updatePaymentStatusActionMock.mockResolvedValue({
      success: false,
      error: "Status update failed",
    });
    render(<PaymentTable payments={[{ ...payments[0], status: "PENDING" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /set to success/i }));
    expect(await screen.findByText(/status update failed/i)).toBeDefined();
  });

  it("shows generic error feedback when refund throws unexpectedly", async () => {
    refundPaymentActionMock.mockResolvedValue({ success: false, error: "Something went wrong" });
    render(<PaymentTable payments={payments} />);
    fireEvent.click(screen.getByRole("button", { name: /refund/i }));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeDefined());
  });
});
