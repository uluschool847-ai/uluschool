import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  getAdminAnalyticsOverview,
  getAdvancedBIMetrics,
} from "@/lib/repositories/analytics-repository";

export const metadata: Metadata = {
  title: "BI Analytics - Admin",
};

export default async function AnalyticsDashboardPage() {
  await requireRole([UserRole.ADMIN]);

  const [basicAnalytics, advancedMetrics] = await Promise.all([
    getAdminAnalyticsOverview(),
    getAdvancedBIMetrics(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Intelligence</h1>
        <p className="text-muted-foreground mt-2">
          Track Lifetime Value (LTV), retention rates, and revenue.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-4xl">
              ${advancedMetrics.totalRevenue.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average LTV</CardDescription>
            <CardTitle className="text-4xl">
              ${advancedMetrics.ltv.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </CardTitle>
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
                            width: `${Math.max(5, (source.count / basicAnalytics.trafficSources[0].count) * 100)}%`,
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
                {advancedMetrics.revenueChartData.map((data) => {
                  const maxAmount = Math.max(
                    ...advancedMetrics.revenueChartData.map((d) => d.amount),
                  );
                  return (
                    <div key={`${data.month}-${data.amount}`} className="flex items-center">
                      <div className="w-1/4 text-xs font-medium text-muted-foreground">
                        {data.month}
                      </div>
                      <div className="w-3/4">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 bg-green-500 rounded-sm"
                            style={{ width: `${Math.max(2, (data.amount / maxAmount) * 100)}%` }}
                          />
                          <span className="text-xs font-semibold">
                            ${data.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
