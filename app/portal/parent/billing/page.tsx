import { UserRole } from "@prisma/client";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { formatMoneyMinor, listParentBillingOverview } from "@/lib/repositories/billing-repository";

function statusCounts(items: { status: string }[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
}

export default async function ParentBillingPage() {
  const session = await requireRole([UserRole.PARENT]);
  const overview = await listParentBillingOverview(session.uid);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="space-y-2">
        <Link className="text-sm font-medium text-blue-700 hover:underline" href="/portal/parent">
          Back to dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-gray-600">
          Local KES invoices, receipts, subscriptions, and M-Pesa mock payments for linked children.
        </p>
      </header>

      {overview.children.length === 0 ? (
        <output className="block rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No linked child billing records found.
        </output>
      ) : (
        <div className="grid gap-4">
          {overview.children.map((child) => {
            const invoiceCounts = statusCounts(child.invoices);
            const latestInvoice = child.invoices[0] ?? null;
            const activeSubscription = child.subscriptions.find(
              (subscription) => subscription.status === "ACTIVE" || subscription.status === "TRIAL",
            );
            return (
              <article
                key={child.id}
                className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{child.fullName}</h2>
                    <p className="text-sm text-gray-500">{child.email}</p>
                  </div>
                  <Link
                    className="text-sm font-semibold text-blue-700 hover:underline"
                    href={`/portal/parent/billing/${child.id}`}
                  >
                    Open child billing
                  </Link>
                </div>
                <dl className="grid gap-3 text-sm md:grid-cols-4">
                  <div>
                    <dt className="text-gray-500">Subscription</dt>
                    <dd className="font-medium text-gray-900">
                      {activeSubscription?.planName ?? "No active subscription"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Issued invoices</dt>
                    <dd className="font-medium text-gray-900">{invoiceCounts.ISSUED ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Paid invoices</dt>
                    <dd className="font-medium text-gray-900">{invoiceCounts.PAID ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Latest amount</dt>
                    <dd className="font-medium text-gray-900">
                      {latestInvoice
                        ? formatMoneyMinor(latestInvoice.amountMinor, latestInvoice.currency)
                        : "No invoice"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
