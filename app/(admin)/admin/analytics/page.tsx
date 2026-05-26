import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  ANALYTICS_BASE_CURRENCY,
  getAdminAnalyticsOverview,
  getAdvancedBIMetrics,
} from "@/lib/repositories/analytics-repository";

export const metadata: Metadata = {
  title: "BI Analytics - Admin",
};

type SearchParams = Record<string, string | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function resolveParams(searchParams: PageProps["searchParams"]) {
  return searchParams ? await searchParams : {};
}

function pickFilters(params: SearchParams) {
  return {
    ...(parseDate(params.from) ? { from: parseDate(params.from) } : {}),
    ...(parseDate(params.to) ? { to: parseDate(params.to) } : {}),
    ...(params.levelId ? { levelId: params.levelId } : {}),
    ...(params.planId ? { planId: params.planId } : {}),
    ...(params.subjectId ? { subjectId: params.subjectId } : {}),
    ...(params.teacherId ? { teacherId: params.teacherId } : {}),
    ...(params.trafficSource ? { trafficSource: params.trafficSource } : {}),
  };
}

function exportHref(params: SearchParams) {
  const next = new URLSearchParams();
  for (const key of [
    "from",
    "to",
    "levelId",
    "planId",
    "subjectId",
    "teacherId",
    "trafficSource",
  ]) {
    const value = params[key];
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/admin/analytics/export?${query}` : "/admin/analytics/export";
}

function formatCurrency(amount: number) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: ANALYTICS_BASE_CURRENCY,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

function calculateBarWidth(value: number, maxValue: number, minimumWidth = 2) {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) {
    return minimumWidth;
  }

  return Math.min(100, Math.max(minimumWidth, (value / maxValue) * 100));
}

export default async function AnalyticsDashboardPage({ searchParams }: PageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const params = await resolveParams(searchParams);
  const filters = pickFilters(params);

  const [basicAnalytics, advancedMetrics] = await Promise.all([
    getAdminAnalyticsOverview(filters),
    getAdvancedBIMetrics(filters),
  ]);
  const maxTrafficCount = Math.max(
    ...basicAnalytics.trafficSources.map((source) => source.count),
    0,
  );
  const maxMonthlyRevenue = Math.max(
    ...advancedMetrics.revenueChartData.map((data) => data.amount),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Intelligence</h1>
        <p className="text-muted-foreground mt-2">
          Track Lifetime Value (LTV), retention rates, and KES revenue.
        </p>
      </div>

      <form
        aria-label="Analytics filters"
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4"
      >
        <label className="text-sm">
          From
          <input
            className="mt-1 w-full rounded border p-2"
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
          />
        </label>
        <label className="text-sm">
          To
          <input
            className="mt-1 w-full rounded border p-2"
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
          />
        </label>
        <label className="text-sm">
          Plan ID
          <input
            className="mt-1 w-full rounded border p-2"
            name="planId"
            defaultValue={params.planId ?? ""}
          />
        </label>
        <label className="text-sm">
          Traffic source
          <input
            className="mt-1 w-full rounded border p-2"
            name="trafficSource"
            defaultValue={params.trafficSource ?? ""}
          />
        </label>
        <label className="text-sm">
          Level ID
          <input
            className="mt-1 w-full rounded border p-2"
            name="levelId"
            defaultValue={params.levelId ?? ""}
          />
        </label>
        <label className="text-sm">
          Subject ID
          <input
            className="mt-1 w-full rounded border p-2"
            name="subjectId"
            defaultValue={params.subjectId ?? ""}
          />
        </label>
        <label className="text-sm">
          Teacher ID
          <input
            className="mt-1 w-full rounded border p-2"
            name="teacherId"
            defaultValue={params.teacherId ?? ""}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Apply
          </button>
          <a className="rounded border px-4 py-2 text-sm font-semibold" href={exportHref(params)}>
            Export CSV
          </a>
        </div>
      </form>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-4xl">
              {formatCurrency(advancedMetrics.totalRevenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average LTV</CardDescription>
            <CardTitle className="text-4xl">{formatCurrency(advancedMetrics.ltv)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Retention Rate</CardDescription>
            <CardTitle className="text-4xl">{advancedMetrics.retentionRate.toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Subscriptions</CardDescription>
            <CardTitle className="text-4xl">{advancedMetrics.activeSubscriptions}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Traffic Channels & Conversion</CardTitle>
            <CardDescription>
              Overall Conversion Rate: {basicAnalytics.conversionRate.toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            {basicAnalytics.trafficSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No traffic source data available.</p>
            ) : (
              <div className="space-y-4">
                {basicAnalytics.trafficSources.map((source) => (
                  <div key={source.source} className="flex items-center">
                    <div className="w-1/3 text-sm font-medium">{source.source}</div>
                    <div className="w-2/3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 bg-primary rounded-full"
                          style={{
                            width: `${calculateBarWidth(source.count, maxTrafficCount, 5)}%`,
                          }}
                        />
                        <span className="text-xs text-muted-foreground w-8">{source.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue Trend</CardTitle>
            <CardDescription>Successful payment transactions over time.</CardDescription>
          </CardHeader>
          <CardContent>
            {advancedMetrics.revenueChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment data available.</p>
            ) : (
              <div className="space-y-4 mt-2">
                {/* Note: In a production app, use Recharts or Tremor here. Falling back to a simple bar chart. */}
                {advancedMetrics.revenueChartData.map((data) => (
                  <div key={`${data.month}-${data.amount}`} className="flex items-center">
                    <div className="w-1/4 text-xs font-medium text-muted-foreground">
                      {data.month}
                    </div>
                    <div className="w-3/4">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 bg-green-500 rounded-sm"
                          style={{
                            width: `${calculateBarWidth(data.amount, maxMonthlyRevenue)}%`,
                          }}
                        />
                        <span className="text-xs font-semibold">{formatCurrency(data.amount)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
