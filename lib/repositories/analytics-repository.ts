import { EnquiryStatus, PaymentStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const ANALYTICS_BASE_CURRENCY = "KES";
const SUCCESSFUL_PAYMENT_STATUSES = [PaymentStatus.SUCCESS, PaymentStatus.SUCCEEDED];

type DateRange = {
  from?: Date;
  to?: Date;
  startDate?: Date;
  endDate?: Date;
};

export type AdminAnalyticsFilters = DateRange & {
  levelId?: string;
  planId?: string;
  subjectId?: string;
  teacherId?: string;
  trafficSource?: string;
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

function clean(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildPaymentWhere(
  filters: AdminAnalyticsFilters = {},
): Prisma.PaymentTransactionWhereInput {
  const paymentDate = buildPaymentDateFilter(filters);
  const where: Prisma.PaymentTransactionWhereInput = {
    status: { in: SUCCESSFUL_PAYMENT_STATUSES },
    currency: ANALYTICS_BASE_CURRENCY,
    ...(paymentDate ? { paymentDate } : {}),
  };
  const planId = clean(filters.planId);
  const levelId = clean(filters.levelId);
  if (planId || levelId) {
    where.subscription = {
      ...(planId ? { planId } : {}),
      ...(levelId ? { plan: { levelId } } : {}),
    };
  }

  const subjectId = clean(filters.subjectId);
  const teacherId = clean(filters.teacherId);
  if (subjectId || teacherId) {
    where.student = {
      is: {
        enrolledClassGroups: {
          some: {
            ...(subjectId ? { subjectId } : {}),
            ...(teacherId ? { teacherId } : {}),
          },
        },
      },
    };
  }

  return where;
}

export async function getRevenueMetrics(dateRange?: DateRange) {
  const where = buildPaymentWhere(dateRange);

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

export async function getAnalyticsInputs(filters: AdminAnalyticsFilters = {}) {
  const createdAt = buildPaymentDateFilter(filters);
  const paymentWhere = buildPaymentWhere(filters);

  const [signupRows, payments] = await Promise.all([
    prisma.appUser.groupBy({
      by: ["createdAt"],
      ...(createdAt ? { where: { createdAt } } : {}),
      _count: { _all: true },
    }),
    prisma.paymentTransaction.findMany({
      where: paymentWhere,
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

export async function getAdminAnalyticsOverview(filters: AdminAnalyticsFilters = {}) {
  const createdAt = buildPaymentDateFilter(filters);
  const source = clean(filters.trafficSource);
  const sourceWhere = source ? { utmSource: source } : {};
  const [
    totalApplications,
    acceptedApplications,
    totalContactLeads,
    enquiriesBySource,
    contactBySource,
  ] = await Promise.all([
    prisma.enquiry.count({ where: { ...(createdAt ? { createdAt } : {}), ...sourceWhere } }),
    prisma.enquiry.count({
      where: {
        status: EnquiryStatus.CONVERTED,
        ...(createdAt ? { createdAt } : {}),
        ...sourceWhere,
      },
    }),
    prisma.contactLead.count({ where: { ...(createdAt ? { createdAt } : {}), ...sourceWhere } }),
    prisma.enquiry.groupBy({
      by: ["utmSource"],
      where: { ...(createdAt ? { createdAt } : {}), ...sourceWhere },
      _count: { _all: true },
    }),
    prisma.contactLead.groupBy({
      by: ["utmSource"],
      where: { ...(createdAt ? { createdAt } : {}), ...sourceWhere },
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

export async function getAdvancedBIMetrics(filters: AdminAnalyticsFilters = {}) {
  const paymentWhere = buildPaymentWhere(filters);
  const [totalPayments, allPayments, activeSubscriptions, cancelledSubscriptions] =
    await Promise.all([
      prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: paymentWhere,
      }),
      prisma.paymentTransaction.findMany({
        where: paymentWhere,
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
    where: paymentWhere,
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

export async function getAnalyticsCsvRows(filters: AdminAnalyticsFilters = {}) {
  const [overview, metrics, inputs] = await Promise.all([
    getAdminAnalyticsOverview(filters),
    getAdvancedBIMetrics(filters),
    getAnalyticsInputs(filters),
  ]);

  return [
    ["metric", "value", "currency"],
    ["totalRevenue", metrics.totalRevenue.toFixed(2), ANALYTICS_BASE_CURRENCY],
    ["averageLtv", metrics.ltv.toFixed(2), ANALYTICS_BASE_CURRENCY],
    ["retentionRate", metrics.retentionRate.toFixed(2), "percent"],
    ["activeSubscriptions", String(metrics.activeSubscriptions), ""],
    ["conversionRate", overview.conversionRate.toFixed(2), "percent"],
    ...inputs.dailyRevenue.map((row) => [
      `dailyRevenue:${row.date}`,
      row.amount.toFixed(2),
      row.currency,
    ]),
    ...inputs.dailySignups.map((row) => [`dailySignups:${row.date}`, String(row.count), "count"]),
  ];
}
