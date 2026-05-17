import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updatePaymentStatusActionMock = vi.hoisted(() => vi.fn());
const refundPaymentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/billing/actions", () => ({
  updatePaymentStatusAction: updatePaymentStatusActionMock,
  refundPaymentAction: refundPaymentActionMock,
}));

type PaymentTableProps = {
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: "SUCCESS" | "PENDING" | "FAILED";
    paymentDate: Date | string;
    student?: { fullName: string; email: string } | null;
    subscription?: { planName: string } | null;
  }>;
};

async function loadPaymentTable() {
  const specifier = "@/components/admin/billing/PaymentTable";
  return import(/* @vite-ignore */ specifier) as Promise<{
    PaymentTable: React.ComponentType<PaymentTableProps>;
  }>;
}

describe("Admin billing payment actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("PaymentTable renders payments and formats partial failed data safely", async () => {
    const { PaymentTable } = await loadPaymentTable();

    render(
      <PaymentTable
        payments={[
          {
            id: "pay-failed",
            amount: 0,
            currency: "USD",
            status: "FAILED",
            paymentDate: "2026-05-01T10:00:00.000Z",
            student: null,
            subscription: null,
          },
        ]}
      />,
    );

    expect(screen.getByText(/failed/i)).toBeDefined();
    expect(screen.getByText(/unknown student|unlinked student|no student/i)).toBeDefined();
    expect(screen.getByText(/\$0\.00|USD\s*0\.00|0\.00\s*USD/i)).toBeDefined();
  });

  it("clicking Refund triggers the refund server action for successful payments", async () => {
    refundPaymentActionMock.mockResolvedValueOnce({
      success: true,
      message: "Local refund marker applied. Payment status set to FAILED.",
    });
    const { PaymentTable } = await loadPaymentTable();

    render(
      <PaymentTable
        payments={[
          {
            id: "pay-1",
            amount: 1500,
            currency: "USD",
            status: "SUCCESS",
            paymentDate: "2026-05-01T10:00:00.000Z",
            student: { fullName: "Alice Student", email: "alice@example.com" },
            subscription: { planName: "IGCSE Monthly" },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refund/i }));

    await waitFor(() => {
      expect(refundPaymentActionMock).toHaveBeenCalledWith({ paymentId: "pay-1" });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /set to success/i })).toBeDefined();
    });
  });

  it("changing payment status triggers the update status server action", async () => {
    updatePaymentStatusActionMock.mockResolvedValueOnce({ success: true });
    const { PaymentTable } = await loadPaymentTable();

    render(
      <PaymentTable
        payments={[
          {
            id: "pay-2",
            amount: 500,
            currency: "USD",
            status: "PENDING",
            paymentDate: "2026-05-02T10:00:00.000Z",
            student: { fullName: "Bob Student", email: "bob@example.com" },
            subscription: { planName: "Trial Plan" },
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/payment status/i), {
      target: { value: "SUCCESS" },
    });

    await waitFor(() => {
      expect(updatePaymentStatusActionMock).toHaveBeenCalledWith({
        paymentId: "pay-2",
        status: "SUCCESS",
      });
    });
  });

  it("PaymentTable shows an empty state when payment history is empty", async () => {
    const { PaymentTable } = await loadPaymentTable();

    render(<PaymentTable payments={[]} />);

    expect(screen.getByText(/no payments|empty payment|no billing history/i)).toBeDefined();
  });
});
