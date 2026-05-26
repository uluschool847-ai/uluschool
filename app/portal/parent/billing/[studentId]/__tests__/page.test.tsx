import { cleanup, render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getParentChildBillingMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/app/portal/parent/actions/billing-actions", () => ({
  simulateMockMpesaCallbackAction: vi.fn(),
  startMockMpesaPaymentAction: vi.fn(),
}));

vi.mock("@/lib/repositories/billing-repository", () => ({
  formatMoneyMinor: (amountMinor: number, currency = "KES") => `${currency} ${amountMinor / 100}`,
  getParentChildBilling: getParentChildBillingMock,
}));

type PageModule = {
  default: (props: { params: Promise<{ studentId: string }> }) => Promise<JSX.Element>;
};

async function loadPage() {
  return import("@/app/portal/parent/billing/[studentId]/page") as Promise<PageModule>;
}

describe("Parent child billing page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads billing through parent-scoped repository and renders invoice/payment workflow", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-1", role: "PARENT" });
    getParentChildBillingMock.mockResolvedValueOnce({
      invoices: [
        {
          amountMinor: 1200000,
          currency: "KES",
          dueDate: new Date("2026-06-10T00:00:00.000Z"),
          id: "invoice-1",
          invoiceNumber: "INV-001",
          issuedAt: new Date("2026-06-01T00:00:00.000Z"),
          status: "ISSUED",
          title: "June tuition",
        },
      ],
      payments: [
        {
          amount: 12000,
          amountMinor: 1200000,
          currency: "KES",
          id: "payment-1",
          paymentDate: new Date("2026-06-02T00:00:00.000Z"),
          provider: "MPESA",
          status: "PENDING",
        },
      ],
      student: { fullName: "Linked Child", id: "student-1" },
      subscriptions: [
        {
          endDate: null,
          id: "sub-1",
          planName: "IGCSE Monthly",
          startDate: new Date("2026-06-01T00:00:00.000Z"),
          status: "ACTIVE",
        },
      ],
    });

    const Page = (await loadPage()).default;
    render(await Page({ params: Promise.resolve({ studentId: "student-1" }) }));

    expect(requireRoleMock).toHaveBeenCalledWith(["PARENT"]);
    expect(getParentChildBillingMock).toHaveBeenCalledWith("parent-1", "student-1");
    expect(screen.getByRole("heading", { name: "Billing for Linked Child" })).toBeInTheDocument();
    expect(screen.getByText("IGCSE Monthly")).toBeInTheDocument();
    const invoice = screen.getByText(/INV-001/).closest("article");
    expect(invoice).not.toBeNull();
    expect(
      within(invoice as HTMLElement).getByRole("link", { name: "Open invoice" }),
    ).toHaveAttribute("href", "/portal/parent/billing/invoices/invoice-1");
    expect(screen.getByRole("button", { name: "Pay with M-Pesa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate paid callback" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate failed callback" })).toBeInTheDocument();
  });

  it("returns notFound for unlinked child billing", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-1", role: "PARENT" });
    getParentChildBillingMock.mockResolvedValueOnce(null);

    const Page = (await loadPage()).default;

    await expect(
      Page({ params: Promise.resolve({ studentId: "foreign-student" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
