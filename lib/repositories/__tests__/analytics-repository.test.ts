import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    groupBy: vi.fn(),
  },
  paymentTransaction: {
    aggregate: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  studentSubscription: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type AnalyticsRepositoryModule = {
  getRevenueMetrics: (dateRange?: { from?: Date; to?: Date }) => Promise<{
    totalRevenue: number;
    successfulPaymentCount: number;
    averagePaymentAmount: number;
    currencyBreakdown: Array<{ currency: string; amount: number }>;
  }>;
  getAnalyticsInputs: (dateRange?: { from?: Date; to?: Date }) => Promise<{
    dailySignups: Array<{ date: string; count: number }>;
    dailyRevenue: Array<{ date: string; amount: number; currency: string }>;
  }>;
  getAdvancedBIMetrics: () => Promise<{
    totalRevenue: number;
    ltv: number;
    activeSubscriptions: number;
    retentionRate: number;
    revenueChartData: Array<{ month: string; amount: number }>;
  }>;
};

async function loadAnalyticsRepository() {
  const specifier = "@/lib/repositories/analytics-repository";
  return import(/* @vite-ignore */ specifier) as Promise<AnalyticsRepositoryModule>;
}

describe("analytics-repository billing and analytics visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getRevenueMetrics aggregates only successful KES payments", async () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-31T23:59:59.999Z");
    prismaMock.paymentTransaction.aggregate.mockResolvedValueOnce({
      _sum: { amount: 3000 },
      _count: { _all: 2 },
      _avg: { amount: 1500 },
    });
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([
      { amount: 1000, currency: "KES" },
      { amount: 2000, currency: "KES" },
    ]);

    const { getRevenueMetrics } = await loadAnalyticsRepository();
    const result = await getRevenueMetrics({ from, to });

    expect(prismaMock.paymentTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        status: { in: ["SUCCESS", "SUCCEEDED"] },
        currency: "KES",
        paymentDate: { gte: from, lte: to },
      },
      _sum: { amount: true },
      _count: { _all: true },
      _avg: { amount: true },
    });
    expect(result).toEqual({
      totalRevenue: 3000,
      successfulPaymentCount: 2,
      averagePaymentAmount: 1500,
      currencyBreakdown: [{ currency: "KES", amount: 3000 }],
    });
  });

  it("getAnalyticsInputs exposes raw daily signup and KES revenue inputs for charts", async () => {
    prismaMock.appUser.groupBy.mockResolvedValueOnce([
      { createdAt: new Date("2026-05-01T10:00:00.000Z"), _count: { _all: 3 } },
    ]);
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([
      { amount: 1200, currency: "KES", paymentDate: new Date("2026-05-01T12:00:00.000Z") },
      { amount: 800, currency: "KES", paymentDate: new Date("2026-05-01T16:00:00.000Z") },
    ]);

    const { getAnalyticsInputs } = await loadAnalyticsRepository();
    const result = await getAnalyticsInputs();

    expect(prismaMock.paymentTransaction.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["SUCCESS", "SUCCEEDED"] },
        currency: "KES",
      },
      select: { amount: true, currency: true, paymentDate: true },
      orderBy: { paymentDate: "asc" },
    });
    expect(result).toEqual({
      dailySignups: [{ date: "2026-05-01", count: 3 }],
      dailyRevenue: [{ date: "2026-05-01", amount: 2000, currency: "KES" }],
    });
  });

  it("getAdvancedBIMetrics applies the KES-only analytics guard", async () => {
    prismaMock.paymentTransaction.aggregate.mockResolvedValueOnce({
      _sum: { amount: 1000 },
    });
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([
      { amount: 1000, paymentDate: new Date("2026-05-01T12:00:00.000Z") },
    ]);
    prismaMock.studentSubscription.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prismaMock.paymentTransaction.groupBy.mockResolvedValueOnce([{ studentId: "student-1" }]);

    const { getAdvancedBIMetrics } = await loadAnalyticsRepository();
    const result = await getAdvancedBIMetrics();

    expect(prismaMock.paymentTransaction.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
      where: { status: { in: ["SUCCESS", "SUCCEEDED"] }, currency: "KES" },
    });
    expect(prismaMock.paymentTransaction.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["SUCCESS", "SUCCEEDED"] }, currency: "KES" },
      orderBy: { paymentDate: "asc" },
      select: { amount: true, paymentDate: true },
    });
    expect(prismaMock.paymentTransaction.groupBy).toHaveBeenCalledWith({
      by: ["studentId"],
      where: { status: { in: ["SUCCESS", "SUCCEEDED"] }, currency: "KES" },
    });
    expect(result).toEqual({
      totalRevenue: 1000,
      ltv: 1000,
      activeSubscriptions: 2,
      retentionRate: expect.closeTo(66.666, 2),
      revenueChartData: [{ month: "2026-05", amount: 1000 }],
    });
  });
});
