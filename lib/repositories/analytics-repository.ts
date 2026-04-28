import { EnquiryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getAdminAnalyticsOverview() {
  const [
    totalApplications,
    acceptedApplications,
    totalContactLeads,
    enquiriesBySource,
    contactBySource,
  ] = await Promise.all([
    prisma.enquiry.count(),
    prisma.enquiry.count({ where: { status: EnquiryStatus.ACCEPTED } }),
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
        where: { status: "SUCCESS" },
      }),
      prisma.paymentTransaction.findMany({
        where: { status: "SUCCESS" },
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
    where: { status: "SUCCESS" },
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
