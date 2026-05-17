import { PaymentStatus, SubscriptionStatus } from "@prisma/client";

import { type BillingPayment, PaymentTable } from "@/components/admin/billing/PaymentTable";
import { findAllPayments, findAllSubscriptions } from "@/lib/repositories/analytics-repository";

type SearchParams = Record<string, string | undefined>;

type BillingPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function parsePaymentStatus(status?: string) {
  if (!status) return undefined;
  return Object.values(PaymentStatus).includes(status as PaymentStatus)
    ? (status as PaymentStatus)
    : undefined;
}

function parseSubscriptionStatus(status?: string) {
  if (!status) return undefined;
  return Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)
    ? (status as SubscriptionStatus)
    : undefined;
}

export default async function AdminBillingPage({ searchParams = {} }: BillingPageProps) {
  const resolvedSearchParams = await searchParams;
  const paymentStatus = parsePaymentStatus(resolvedSearchParams.status);
  const subscriptionStatus = parseSubscriptionStatus(resolvedSearchParams.subscriptionStatus);
  const [paymentsResult, subscriptionsResult] = await Promise.all([
    findAllPayments({
      status: paymentStatus,
    }),
    findAllSubscriptions({
      plan: resolvedSearchParams.plan,
      status: subscriptionStatus,
    }),
  ]);

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-950">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">Inspect local payments and subscriptions.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-4 md:grid-cols-3" action="/admin/billing">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Payment status
            <select
              name="status"
              defaultValue={paymentStatus ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">All payments</option>
              {Object.values(PaymentStatus).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Subscription status
            <select
              name="subscriptionStatus"
              defaultValue={subscriptionStatus ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">All subscriptions</option>
              {Object.values(SubscriptionStatus).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Plan
            <input
              name="plan"
              defaultValue={resolvedSearchParams.plan ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="IGCSE, BASIC, PRO..."
            />
          </label>
          <button
            type="submit"
            className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">Payments</h2>
        <PaymentTable payments={paymentsResult.items as BillingPayment[]} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">Subscriptions</h2>
        {subscriptionsResult.items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No subscriptions found.
          </div>
        ) : (
          <div className="grid gap-3">
            {subscriptionsResult.items.map((subscription) => (
              <article
                key={subscription.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h3 className="font-semibold text-slate-950">{subscription.planName}</h3>
                <p className="text-sm text-slate-600">
                  {subscription.student?.fullName ?? "Unknown student"}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase text-slate-500">
                  {subscription.status}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
