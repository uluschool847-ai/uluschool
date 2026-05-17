import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAdminAnalyticsOverviewMock = vi.hoisted(() => vi.fn());
const getAdvancedBIMetricsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/analytics-repository", () => ({
  getAdminAnalyticsOverview: getAdminAnalyticsOverviewMock,
  getAdvancedBIMetrics: getAdvancedBIMetricsMock,
}));

type PageModule = {
  default: () => Promise<JSX.Element>;
};

async function loadAnalyticsPage() {
  const specifier = "@/app/(admin)/admin/analytics/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

describe("Admin analytics dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    getAdminAnalyticsOverviewMock.mockResolvedValue({
      totalApplications: 0,
      acceptedApplications: 0,
      conversionRate: 0,
      totalContactLeads: 0,
      trafficSources: [],
    });
    getAdvancedBIMetricsMock.mockResolvedValue({
      totalRevenue: 0,
      ltv: 0,
      activeSubscriptions: 0,
      retentionRate: 0,
      revenueChartData: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires admin access and renders the BI metric regions", async () => {
    const page = await loadAnalyticsPage();
    const element = await page.default();

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith(["ADMIN"]);
    expect(screen.getByRole("heading", { name: /business intelligence/i })).toBeDefined();
    expect(screen.getByText(/total revenue/i)).toBeDefined();
    expect(screen.getByText(/average ltv/i)).toBeDefined();
    expect(screen.getAllByText(/retention rate/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/active subscriptions/i)).toBeDefined();
    expect(screen.getByText(/traffic channels & conversion/i)).toBeDefined();
    expect(screen.getByText(/monthly revenue trend/i)).toBeDefined();
  });

  it("keeps zero-valued charts finite and readable", async () => {
    getAdminAnalyticsOverviewMock.mockResolvedValueOnce({
      totalApplications: 0,
      acceptedApplications: 0,
      conversionRate: 0,
      totalContactLeads: 0,
      trafficSources: [{ source: "direct", count: 0 }],
    });
    getAdvancedBIMetricsMock.mockResolvedValueOnce({
      totalRevenue: 0,
      ltv: 0,
      activeSubscriptions: 0,
      retentionRate: 0,
      revenueChartData: [{ month: "2026-05", amount: 0 }],
    });

    const page = await loadAnalyticsPage();
    const element = await page.default();

    const { container } = render(element);

    expect(container.textContent).not.toMatch(/NaN|Infinity/);

    const revenueBar = Array.from(container.querySelectorAll("div")).find((node) =>
      String(node.className).includes("bg-green-500"),
    ) as HTMLDivElement | undefined;
    const trafficBar = Array.from(container.querySelectorAll("div")).find((node) =>
      String(node.className).includes("bg-primary"),
    ) as HTMLDivElement | undefined;

    expect(revenueBar?.style.width).toBe("2%");
    expect(trafficBar?.style.width).toBe("5%");
  });
});
