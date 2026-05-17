import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    student: { fullName: "John Doe", email: "john@example.com" },
    subscription: { planName: "Basic" },
  },
];

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("PaymentTable accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePaymentStatusActionMock.mockResolvedValue({ success: true, message: "Updated" });
    refundPaymentActionMock.mockResolvedValue({ success: true, message: "Refunded" });
    setViewport(1280);
  });

  afterEach(() => cleanup());

  it("gives the table an accessible name or caption", () => {
    render(<PaymentTable payments={payments} />);

    expect(screen.getByRole("table", { name: /payments|billing|transactions/i })).not.toBeNull();
  });

  it("uses column headers with scope=col and row headers when rows are identified by student", () => {
    const { container } = render(<PaymentTable payments={payments} />);

    expect(container.querySelectorAll("th[scope='col']").length).toBeGreaterThan(0);
    expect(container.querySelector("th[scope='row']")).not.toBeNull();
  });

  it("gives row action buttons accessible names that mention the row subject", () => {
    render(<PaymentTable payments={payments} />);

    expect(
      screen.getByRole("button", { name: /refund student: john doe|refund payment for john doe/i }),
    ).not.toBeNull();
  });

  it("shows an empty state with role=status when no data is present", () => {
    render(<PaymentTable payments={[]} />);

    const status = screen.getByRole("status");
    expect(status.textContent ?? "").toMatch(/no payments/i);
  });

  it("uses a horizontal scroll container on mobile", () => {
    setViewport(375);
    const { container } = render(<PaymentTable payments={payments} />);

    const scrollContainer = container.querySelector(".overflow-x-auto, .overflow-x-scroll");
    expect(scrollContainer).not.toBeNull();
  });

  it("shows an accessible loading state while actions are pending", async () => {
    updatePaymentStatusActionMock.mockImplementation(() => new Promise(() => {}));
    render(<PaymentTable payments={[{ ...payments[0], status: "PENDING" }]} />);

    fireEvent.click(screen.getByRole("button", { name: /set to success/i }));

    const table = screen.getByRole("table", { name: /payments|billing|transactions/i });
    expect(
      table.getAttribute("aria-busy") === "true" ||
        screen.queryByRole("progressbar") !== null ||
        screen.queryByLabelText(/loading/i) !== null,
    ).toBe(true);
  });

  it("shows an error alert and retry control when an action fails", async () => {
    updatePaymentStatusActionMock.mockResolvedValue({
      success: false,
      message: "Status update failed",
    });
    render(<PaymentTable payments={[{ ...payments[0], status: "PENDING" }]} />);

    fireEvent.click(screen.getByRole("button", { name: /set to success/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/status update failed/i);
    expect(screen.getByRole("button", { name: /retry/i })).not.toBeNull();
  });
});
