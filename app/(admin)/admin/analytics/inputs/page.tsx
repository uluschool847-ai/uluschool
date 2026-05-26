import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import { getAnalyticsInputs } from "@/lib/repositories/analytics-repository";

type SearchParams = Record<string, string | undefined>;

type AnalyticsInputsPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export default async function AdminAnalyticsInputsPage({
  searchParams = {},
}: AnalyticsInputsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const inputs = await getAnalyticsInputs({
    ...(parseDate(params.from) ? { from: parseDate(params.from) } : {}),
    ...(parseDate(params.to) ? { to: parseDate(params.to) } : {}),
  });

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-950">Analytics Inputs</h1>
        <p className="mt-2 text-sm text-slate-600">Raw local data rows used by analytics charts.</p>
      </header>

      <form aria-label="Analytics input filters" className="flex flex-wrap gap-3">
        <label className="text-sm">
          From
          <input
            className="ml-2 rounded border p-2"
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
          />
        </label>
        <label className="text-sm">
          To
          <input
            className="ml-2 rounded border p-2"
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
          />
        </label>
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Apply
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Daily Sign-ups</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-xl border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Count</th>
              </tr>
            </thead>
            <tbody>
              {inputs.dailySignups.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-6 text-sm text-slate-600" colSpan={2}>
                    No sign-up data available.
                  </td>
                </tr>
              ) : (
                inputs.dailySignups.map((row) => (
                  <tr key={row.date} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{row.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Daily Revenue</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-xl border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inputs.dailyRevenue.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-6 text-sm text-slate-600" colSpan={2}>
                    No revenue data available.
                  </td>
                </tr>
              ) : (
                inputs.dailyRevenue.map((row) => (
                  <tr key={`${row.date}-${row.currency}`} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">{formatCurrency(row.amount, row.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
