import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findAllPaymentsMock = vi.hoisted(() => vi.fn());
const findAllSubscriptionsMock = vi.hoisted(() => vi.fn());
const getAnalyticsInputsMock = vi.hoisted(() => vi.fn());
const listAdminBillingDataMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/analytics-repository", () => ({
  findAllPayments: findAllPaymentsMock,
  findAllSubscriptions: findAllSubscriptionsMock,
  getAnalyticsInputs: getAnalyticsInputsMock,
}));

vi.mock("@/lib/repositories/billing-repository", () => ({
  formatMoneyMinor: (amountMinor: number, currency = "KES") => `${currency} ${amountMinor / 100}`,
  listAdminBillingData: listAdminBillingDataMock,
}));

type PageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element>;
};

async function loadBillingPage() {
  const specifier = "@/app/(admin)/admin/billing/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

async function loadAnalyticsInputsPage() {
  const specifier = "@/app/(admin)/admin/analytics/inputs/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

describe("Admin billing and analytics visibility pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("Billing page renders payment and subscription records", async () => {
    findAllPaymentsMock.mockResolvedValueOnce({
      items: [
        {
          id: "pay-1",
          amount: 1500,
          currency: "USD",
          status: "SUCCESS",
          paymentDate: new Date("2026-05-01T10:00:00.000Z"),
          student: { fullName: "Alice Student", email: "alice@example.com" },
        },
      ],
      totalCount: 1,
      totalPages: 1,
    });
    findAllSubscriptionsMock.mockResolvedValueOnce({
      items: [
        {
          id: "sub-1",
          planName: "IGCSE Monthly",
          status: "ACTIVE",
          student: { fullName: "Alice Student", email: "alice@example.com" },
        },
      ],
      totalCount: 1,
      totalPages: 1,
    });

    listAdminBillingDataMock.mockResolvedValueOnce({
      invoices: [],
      payments: [
        {
          amount: 1500,
          amountMinor: 150000,
          currency: "KES",
          id: "pay-1",
          paymentDate: new Date("2026-05-01T10:00:00.000Z"),
          status: "SUCCEEDED",
          student: { fullName: "Alice Student", email: "alice@example.com" },
        },
      ],
      plans: [],
      subscriptions: [
        {
          id: "sub-1",
          planName: "IGCSE Monthly",
          status: "ACTIVE",
          student: { fullName: "Alice Student", email: "alice@example.com" },
        },
      ],
    });

    const page = await loadBillingPage();
    const element = await page.default({
      searchParams: { status: "SUCCESS", subscriptionStatus: "ACTIVE" },
    });

    render(element);

    expect(listAdminBillingDataMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SUCCESS", subscriptionStatus: "ACTIVE" }),
    );
    expect(screen.getAllByText(/alice student/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/igcse monthly/i)).toBeDefined();
    expect(screen.getAllByText(/success/i).length).toBeGreaterThan(0);
  });

  it("Billing page formats payment amount and currency", async () => {
    listAdminBillingDataMock.mockResolvedValueOnce({
      invoices: [],
      payments: [
        {
          amount: 1234.5,
          amountMinor: 123450,
          currency: "KES",
          id: "pay-1",
          paymentDate: new Date("2026-05-01T10:00:00.000Z"),
          status: "SUCCEEDED",
          student: { fullName: "Alice Student", email: "alice@example.com" },
        },
      ],
      plans: [],
      subscriptions: [],
    });

    const page = await loadBillingPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/KES 1234\.5|KES\s*1,234\.50|1,234\.50\s*KES/i)).toBeDefined();
  });

  it("Billing page handles empty payment history", async () => {
    listAdminBillingDataMock.mockResolvedValueOnce({
      invoices: [],
      payments: [],
      plans: [],
      subscriptions: [],
    });

    const page = await loadBillingPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/no payments|empty payment|no billing history/i)).toBeDefined();
    expect(
      screen.getByText(/no subscriptions|no active subscriptions|empty subscriptions/i),
    ).toBeDefined();
  });

  it("Analytics Inputs page displays raw chart input rows from the repository", async () => {
    getAnalyticsInputsMock.mockResolvedValueOnce({
      dailySignups: [{ date: "2026-05-01", count: 4 }],
      dailyRevenue: [{ date: "2026-05-01", amount: 2500, currency: "USD" }],
    });

    const page = await loadAnalyticsInputsPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith(["ADMIN"]);
    expect(getAnalyticsInputsMock).toHaveBeenCalled();
    expect(screen.getByText(/daily sign-ups|daily signups/i)).toBeDefined();
    expect(screen.getByText(/daily revenue/i)).toBeDefined();
    expect(screen.getAllByText("2026-05-01").length).toBeGreaterThan(0);
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText(/\$2,500\.00|USD\s*2,500\.00|2,500\.00\s*USD/i)).toBeDefined();
  });

  it("Analytics Inputs page shows empty states for missing raw data", async () => {
    getAnalyticsInputsMock.mockResolvedValueOnce({
      dailySignups: [],
      dailyRevenue: [],
    });

    const page = await loadAnalyticsInputsPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/no sign-up data available/i)).toBeDefined();
    expect(screen.getByText(/no revenue data available/i)).toBeDefined();
  });
});
