import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getInvoiceForParentMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/billing-repository", () => ({
  formatMoneyMinor: (amountMinor: number, currency = "KES") => `${currency} ${amountMinor / 100}`,
  getInvoiceForParent: getInvoiceForParentMock,
}));

type PageModule = {
  default: (props: { params: Promise<{ invoiceId: string }> }) => Promise<JSX.Element>;
};

async function loadPage() {
  return import("@/app/portal/parent/billing/invoices/[invoiceId]/page") as Promise<PageModule>;
}

describe("Parent invoice detail page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders a linked-child invoice and receipt history", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-1", role: "PARENT" });
    getInvoiceForParentMock.mockResolvedValueOnce({
      amountMinor: 1200000,
      currency: "KES",
      description: "Monthly tuition",
      dueDate: new Date("2026-06-10T00:00:00.000Z"),
      invoiceNumber: "INV-001",
      payments: [
        {
          amount: 12000,
          amountMinor: 1200000,
          currency: "KES",
          id: "payment-1",
          mpesaReceiptNumber: "MPESA-123",
          paymentDate: new Date("2026-06-02T00:00:00.000Z"),
          provider: "MPESA",
          status: "SUCCEEDED",
        },
      ],
      status: "PAID",
      student: { fullName: "Linked Child" },
      studentId: "student-1",
      title: "June tuition",
    });

    const Page = (await loadPage()).default;
    render(await Page({ params: Promise.resolve({ invoiceId: "invoice-1" }) }));

    expect(requireRoleMock).toHaveBeenCalledWith(["PARENT"]);
    expect(getInvoiceForParentMock).toHaveBeenCalledWith("parent-1", "invoice-1");
    expect(screen.getByRole("heading", { name: "INV-001" })).toBeInTheDocument();
    expect(screen.getByText("Linked Child")).toBeInTheDocument();
    expect(screen.getByText("M-Pesa receipt: MPESA-123")).toBeInTheDocument();
  });

  it("returns notFound for missing or unlinked invoices", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-1", role: "PARENT" });
    getInvoiceForParentMock.mockResolvedValueOnce(null);

    const Page = (await loadPage()).default;
    await expect(
      Page({ params: Promise.resolve({ invoiceId: "foreign-invoice" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
