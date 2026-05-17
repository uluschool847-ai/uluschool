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
  findAllPayments: (filters?: {
    status?: "SUCCESS" | "PENDING" | "FAILED";
    dateRange?: { from?: Date; to?: Date };
    page?: number;
    limit?: number;
  }) => Promise<{
    items: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      paymentDate: Date;
    }>;
    totalCount: number;
    totalPages: number;
  }>;
  findAllSubscriptions: (filters?: {
    plan?: string;
    status?: "ACTIVE" | "CANCELLED" | "PAST_DUE";
    page?: number;
    limit?: number;
  }) => Promise<{
    items: Array<{
      id: string;
      planName: string;
      status: string;
    }>;
    totalCount: number;
    totalPages: number;
  }>;
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

  it("findAllPayments filters by status and date range with pagination", async () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-31T23:59:59.999Z");
    prismaMock.paymentTransaction.count.mockResolvedValueOnce(1);
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([
      {
        id: "pay-1",
        amount: 1500,
        currency: "USD",
        status: "SUCCESS",
        paymentDate: new Date("2026-05-10T10:00:00.000Z"),
        student: { id: "student-1", fullName: "Alice Student", email: "alice@example.com" },
        subscription: { id: "sub-1", planName: "IGCSE Monthly" },
      },
    ]);

    const { findAllPayments } = await loadAnalyticsRepository();
    const result = await findAllPayments({
      status: "SUCCESS",
      dateRange: { from, to },
      page: 1,
      limit: 20,
    });

    expect(prismaMock.paymentTransaction.count).toHaveBeenCalledWith({
      where: {
        status: "SUCCESS",
        paymentDate: { gte: from, lte: to },
      },
    });
    expect(prismaMock.paymentTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "SUCCESS",
          paymentDate: { gte: from, lte: to },
        },
        skip: 0,
        take: 20,
      }),
    );
    expect(result).toEqual({
      items: [expect.objectContaining({ id: "pay-1", amount: 1500, currency: "USD" })],
      totalCount: 1,
      totalPages: 1,
    });
  });

  it("findAllPayments returns an empty result for a date range with no data", async () => {
    prismaMock.paymentTransaction.count.mockResolvedValueOnce(0);
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([]);

    const { findAllPayments } = await loadAnalyticsRepository();
    const result = await findAllPayments({
      status: "FAILED",
      dateRange: { from: new Date("2026-01-01"), to: new Date("2026-01-31") },
    });

    expect(result).toEqual({
      items: [],
      totalCount: 0,
      totalPages: 0,
    });
  });

  it("findAllSubscriptions filters by plan and status", async () => {
    prismaMock.studentSubscription.count.mockResolvedValueOnce(1);
    prismaMock.studentSubscription.findMany.mockResolvedValueOnce([
      {
        id: "sub-1",
        planName: "IGCSE Monthly",
        status: "ACTIVE",
        startDate: new Date("2026-05-01"),
        endDate: null,
        student: { id: "student-1", fullName: "Alice Student", email: "alice@example.com" },
        payments: [],
      },
    ]);

    const { findAllSubscriptions } = await loadAnalyticsRepository();
    const result = await findAllSubscriptions({
      plan: "IGCSE",
      status: "ACTIVE",
      page: 1,
      limit: 10,
    });

    expect(prismaMock.studentSubscription.count).toHaveBeenCalledWith({
      where: {
        planName: { contains: "IGCSE", mode: "insensitive" },
        status: "ACTIVE",
      },
    });
    expect(prismaMock.studentSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          planName: { contains: "IGCSE", mode: "insensitive" },
          status: "ACTIVE",
        },
      }),
    );
    expect(result).toEqual({
      items: [expect.objectContaining({ id: "sub-1", planName: "IGCSE Monthly" })],
      totalCount: 1,
      totalPages: 1,
    });
  });

  it("findAllSubscriptions handles partial or failed subscription data", async () => {
    prismaMock.studentSubscription.count.mockResolvedValueOnce(1);
    prismaMock.studentSubscription.findMany.mockResolvedValueOnce([
      {
        id: "sub-partial",
        planName: "Unknown Plan",
        status: "PAST_DUE",
        startDate: new Date("2026-05-01"),
        endDate: null,
        student: null,
        payments: [],
      },
    ]);

    const { findAllSubscriptions } = await loadAnalyticsRepository();
    const result = await findAllSubscriptions({ status: "PAST_DUE" });

    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: "sub-partial", status: "PAST_DUE" }),
    );
  });

  it("getRevenueMetrics aggregates only successful USD payments", async () => {
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-31T23:59:59.999Z");
    prismaMock.paymentTransaction.aggregate.mockResolvedValueOnce({
      _sum: { amount: 3000 },
      _count: { _all: 2 },
      _avg: { amount: 1500 },
    });
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([
      { amount: 1000, currency: "USD" },
      { amount: 2000, currency: "USD" },
    ]);

    const { getRevenueMetrics } = await loadAnalyticsRepository();
    const result = await getRevenueMetrics({ from, to });

    expect(prismaMock.paymentTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        status: "SUCCESS",
        currency: "USD",
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
      currencyBreakdown: [{ currency: "USD", amount: 3000 }],
    });
  });

  it("getAnalyticsInputs exposes raw daily signup and USD revenue inputs for charts", async () => {
    prismaMock.appUser.groupBy.mockResolvedValueOnce([
      { createdAt: new Date("2026-05-01T10:00:00.000Z"), _count: { _all: 3 } },
    ]);
    prismaMock.paymentTransaction.findMany.mockResolvedValueOnce([
      { amount: 1200, currency: "USD", paymentDate: new Date("2026-05-01T12:00:00.000Z") },
      { amount: 800, currency: "USD", paymentDate: new Date("2026-05-01T16:00:00.000Z") },
    ]);

    const { getAnalyticsInputs } = await loadAnalyticsRepository();
    const result = await getAnalyticsInputs();

    expect(prismaMock.paymentTransaction.findMany).toHaveBeenCalledWith({
      where: {
        status: "SUCCESS",
        currency: "USD",
      },
      select: { amount: true, currency: true, paymentDate: true },
      orderBy: { paymentDate: "asc" },
    });
    expect(result).toEqual({
      dailySignups: [{ date: "2026-05-01", count: 3 }],
      dailyRevenue: [{ date: "2026-05-01", amount: 2000, currency: "USD" }],
    });
  });

  it("getAdvancedBIMetrics applies the USD-only analytics guard", async () => {
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
      where: { status: "SUCCESS", currency: "USD" },
    });
    expect(prismaMock.paymentTransaction.findMany).toHaveBeenCalledWith({
      where: { status: "SUCCESS", currency: "USD" },
      orderBy: { paymentDate: "asc" },
      select: { amount: true, paymentDate: true },
    });
    expect(prismaMock.paymentTransaction.groupBy).toHaveBeenCalledWith({
      by: ["studentId"],
      where: { status: "SUCCESS", currency: "USD" },
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
