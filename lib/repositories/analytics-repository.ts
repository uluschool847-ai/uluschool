import { EnquiryStatus, PaymentStatus, type Prisma, type SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const ANALYTICS_BASE_CURRENCY = "USD";

type DateRange = {
  from?: Date;
  to?: Date;
  startDate?: Date;
  endDate?: Date;
};

function buildPaymentDateFilter(dateRange?: DateRange) {
  const from = dateRange?.from ?? dateRange?.startDate;
  const to = dateRange?.to ?? dateRange?.endDate;

  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

export async function findAllPayments(
  filters: {
    status?: PaymentStatus;
    dateRange?: DateRange;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? 20);
  const where: Prisma.PaymentTransactionWhereInput = {};
  const paymentDate = buildPaymentDateFilter(filters.dateRange);

  if (filters.status) {
    where.status = filters.status;
  }

  if (paymentDate) {
    where.paymentDate = paymentDate;
  }

  const [totalCount, items] = await Promise.all([
    prisma.paymentTransaction.count({ where }),
    prisma.paymentTransaction.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        subscription: { select: { id: true, planName: true } },
      },
      orderBy: { paymentDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items,
    totalCount,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / limit),
  };
}

export async function findAllSubscriptions(
  filters: {
    plan?: string;
    status?: SubscriptionStatus;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? 20);
  const where: Prisma.StudentSubscriptionWhereInput = {};
  const plan = filters.plan?.trim();

  if (plan) {
    where.planName = { contains: plan, mode: "insensitive" };
  }

  if (filters.status) {
    where.status = filters.status;
  }

  const [totalCount, items] = await Promise.all([
    prisma.studentSubscription.count({ where }),
    prisma.studentSubscription.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        payments: {
          orderBy: { paymentDate: "desc" },
          take: 3,
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items,
    totalCount,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / limit),
  };
}

export async function getRevenueMetrics(dateRange?: DateRange) {
  const paymentDate = buildPaymentDateFilter(dateRange);
  const where: Prisma.PaymentTransactionWhereInput = {
    status: PaymentStatus.SUCCESS,
    currency: ANALYTICS_BASE_CURRENCY,
    ...(paymentDate ? { paymentDate } : {}),
  };

  const [aggregate, payments] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
      _avg: { amount: true },
    }),
    prisma.paymentTransaction.findMany({
      where,
      select: { amount: true, currency: true },
    }),
  ]);

  const currencyTotals = new Map<string, number>();
  for (const payment of payments) {
    currencyTotals.set(
      payment.currency,
      (currencyTotals.get(payment.currency) ?? 0) + payment.amount,
    );
  }

  return {
    totalRevenue: aggregate._sum.amount ?? 0,
    successfulPaymentCount: aggregate._count._all,
    averagePaymentAmount: aggregate._avg.amount ?? 0,
    currencyBreakdown: Array.from(currencyTotals.entries()).map(([currency, amount]) => ({
      currency,
      amount,
    })),
  };
}

export async function getAnalyticsInputs(dateRange?: DateRange) {
  const createdAt = buildPaymentDateFilter(dateRange);
  const paymentDate = buildPaymentDateFilter(dateRange);

  const [signupRows, payments] = await Promise.all([
    prisma.appUser.groupBy({
      by: ["createdAt"],
      ...(createdAt ? { where: { createdAt } } : {}),
      _count: { _all: true },
    }),
    prisma.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.SUCCESS,
        currency: ANALYTICS_BASE_CURRENCY,
        ...(paymentDate ? { paymentDate } : {}),
      },
      select: { amount: true, currency: true, paymentDate: true },
      orderBy: { paymentDate: "asc" },
    }),
  ]);

  const dailySignupMap = new Map<string, number>();
  for (const row of signupRows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    dailySignupMap.set(date, (dailySignupMap.get(date) ?? 0) + row._count._all);
  }

  const dailyRevenueMap = new Map<string, { date: string; amount: number; currency: string }>();
  for (const payment of payments) {
    const date = payment.paymentDate.toISOString().slice(0, 10);
    const key = `${date}-${payment.currency}`;
    const existing = dailyRevenueMap.get(key);
    dailyRevenueMap.set(key, {
      date,
      amount: (existing?.amount ?? 0) + payment.amount,
      currency: payment.currency,
    });
  }

  return {
    dailySignups: Array.from(dailySignupMap.entries()).map(([date, count]) => ({ date, count })),
    dailyRevenue: Array.from(dailyRevenueMap.values()).map((value) => ({
      date: value.date,
      amount: value.amount,
      currency: value.currency,
    })),
  };
}

export async function getAdminAnalyticsOverview() {
  const [
    totalApplications,
    acceptedApplications,
    totalContactLeads,
    enquiriesBySource,
    contactBySource,
  ] = await Promise.all([
    prisma.enquiry.count(),
    prisma.enquiry.count({ where: { status: EnquiryStatus.CONVERTED } }),
    prisma.contactLead.count(),
    prisma.enquiry.groupBy({
      by: ["utmSource"],
      _count: { _all: true },
    }),
    prisma.contactLead.groupBy({
      by: ["utmSource"],
      _count: { _all: true },
    }),
  ]);

  const sourceMap = new Map<string, number>();
  for (const row of enquiriesBySource) {
    const key = row.utmSource || "direct";
    sourceMap.set(key, (sourceMap.get(key) || 0) + row._count._all);
  }
  for (const row of contactBySource) {
    const key = row.utmSource || "direct";
    sourceMap.set(key, (sourceMap.get(key) || 0) + row._count._all);
  }

  const trafficSources = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const conversionRate =
    totalApplications === 0 ? 0 : (acceptedApplications / totalApplications) * 100;

  return {
    totalApplications,
    acceptedApplications,
    totalContactLeads,
    conversionRate,
    trafficSources,
  };
}

export async function getAdvancedBIMetrics() {
  const [totalPayments, allPayments, activeSubscriptions, cancelledSubscriptions] =
    await Promise.all([
      prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.SUCCESS, currency: ANALYTICS_BASE_CURRENCY },
      }),
      prisma.paymentTransaction.findMany({
        where: { status: PaymentStatus.SUCCESS, currency: ANALYTICS_BASE_CURRENCY },
        orderBy: { paymentDate: "asc" },
        select: { amount: true, paymentDate: true },
      }),
      prisma.studentSubscription.count({ where: { status: "ACTIVE" } }),
      prisma.studentSubscription.count({ where: { status: "CANCELLED" } }),
    ]);

  const totalRevenue = totalPayments._sum.amount || 0;

  // Calculate LTV (Average revenue per active/past student)
  const totalStudentsWithPayments = await prisma.paymentTransaction.groupBy({
    by: ["studentId"],
    where: { status: PaymentStatus.SUCCESS, currency: ANALYTICS_BASE_CURRENCY },
  });
  const ltv =
    totalStudentsWithPayments.length > 0 ? totalRevenue / totalStudentsWithPayments.length : 0;

  // Monthly Revenue Data (for charts)
  const monthlyRevenueMap = new Map<string, number>();
  for (const p of allPayments) {
    const month = `${p.paymentDate.getFullYear()}-${String(p.paymentDate.getMonth() + 1).padStart(2, "0")}`;
    monthlyRevenueMap.set(month, (monthlyRevenueMap.get(month) || 0) + p.amount);
  }
  const revenueChartData = Array.from(monthlyRevenueMap.entries()).map(([month, amount]) => ({
    month,
    amount,
  }));

  // Retention Rate
  const totalSubs = activeSubscriptions + cancelledSubscriptions;
  const retentionRate = totalSubs > 0 ? (activeSubscriptions / totalSubs) * 100 : 0;

  return {
    totalRevenue,
    ltv,
    activeSubscriptions,
    retentionRate,
    revenueChartData,
  };
}
