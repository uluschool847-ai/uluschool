import {
  BillingCycle,
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";

import {
  createBillingPlanAction,
  createManualPaymentAction,
  createSubscriptionAction,
  issueInvoiceAction,
} from "@/app/(admin)/admin/billing/actions";
import { type BillingPayment, PaymentTable } from "@/components/admin/billing/PaymentTable";
import { requireRole } from "@/lib/auth/session";
import { formatMoneyMinor, listAdminBillingData } from "@/lib/repositories/billing-repository";

type SearchParams = Record<string, string | undefined>;

type BillingPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function parseEnumValue<T extends string>(values: readonly T[], value?: string) {
  return value && values.includes(value as T) ? (value as T) : undefined;
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "No date";
  return new Date(date).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminBillingPage({ searchParams = {} }: BillingPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = await searchParams;
  const paymentStatus = parseEnumValue(Object.values(PaymentStatus), resolvedSearchParams.status);
  const subscriptionStatus = parseEnumValue(
    Object.values(SubscriptionStatus),
    resolvedSearchParams.subscriptionStatus,
  );
  const invoiceStatus = parseEnumValue(
    Object.values(InvoiceStatus),
    resolvedSearchParams.invoiceStatus,
  );
  const provider = parseEnumValue(Object.values(PaymentProvider), resolvedSearchParams.provider);
  const { invoices, payments, plans, subscriptions } = await listAdminBillingData({
    invoiceStatus,
    plan: resolvedSearchParams.plan,
    provider,
    status: paymentStatus,
    subscriptionStatus,
  });

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Kenya-ready local ledger
        </p>
        <h1 className="text-3xl font-bold text-slate-950">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage KES plans, parent payers, invoices, receipts, M-Pesa mock payments, and manual
          local payments.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Primary currency</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">KES</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Primary provider</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">M-Pesa</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Invoices</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{invoices.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Plans</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{plans.length}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-4 md:grid-cols-5" action="/admin/billing">
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
            Provider
            <select
              name="provider"
              defaultValue={provider ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">All providers</option>
              {Object.values(PaymentProvider).map((value) => (
                <option key={value} value={value}>
                  {value}
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
            Invoice status
            <select
              name="invoiceStatus"
              defaultValue={invoiceStatus ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">All invoices</option>
              {Object.values(InvoiceStatus).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Plan/search
            <input
              name="plan"
              defaultValue={resolvedSearchParams.plan ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="IGCSE, A-Level..."
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

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={createBillingPlanAction} className="space-y-3 rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Create plan</h2>
          <input
            name="name"
            className="w-full rounded-md border px-3 py-2"
            placeholder="IGCSE Monthly"
            required
          />
          <input
            name="amountMinor"
            type="number"
            className="w-full rounded-md border px-3 py-2"
            placeholder="1200000 for KES 12,000"
            required
          />
          <input
            name="currency"
            defaultValue="KES"
            className="w-full rounded-md border px-3 py-2"
          />
          <select
            name="cycle"
            defaultValue={BillingCycle.MONTHLY}
            className="w-full rounded-md border px-3 py-2"
          >
            {Object.values(BillingCycle).map((cycle) => (
              <option key={cycle} value={cycle}>
                {cycle}
              </option>
            ))}
          </select>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Create plan
          </button>
        </form>

        <form action={createSubscriptionAction} className="space-y-3 rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Assign subscription</h2>
          <input
            name="studentId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Student user id"
            required
          />
          <input
            name="payerUserId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Parent payer id"
          />
          <select name="planId" className="w-full rounded-md border px-3 py-2">
            <option value="">No plan id</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <input
            name="planName"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Fallback plan name"
          />
          <select
            name="status"
            defaultValue={SubscriptionStatus.ACTIVE}
            className="w-full rounded-md border px-3 py-2"
          >
            {Object.values(SubscriptionStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Assign subscription
          </button>
        </form>

        <form action={issueInvoiceAction} className="space-y-3 rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Issue invoice</h2>
          <input
            name="studentId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Student user id"
            required
          />
          <input
            name="payerUserId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Parent payer id"
          />
          <input
            name="title"
            className="w-full rounded-md border px-3 py-2"
            placeholder="May tuition"
            required
          />
          <input
            name="amountMinor"
            type="number"
            className="w-full rounded-md border px-3 py-2"
            placeholder="1200000"
            required
          />
          <input
            name="currency"
            defaultValue="KES"
            className="w-full rounded-md border px-3 py-2"
          />
          <input name="dueDate" type="date" className="w-full rounded-md border px-3 py-2" />
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Issue invoice
          </button>
        </form>

        <form action={createManualPaymentAction} className="space-y-3 rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Record payment</h2>
          <input
            name="studentId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Student user id"
            required
          />
          <input
            name="payerUserId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Parent payer id"
          />
          <input
            name="invoiceId"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Invoice id"
          />
          <input
            name="amountMinor"
            type="number"
            className="w-full rounded-md border px-3 py-2"
            placeholder="1200000"
            required
          />
          <input
            name="phoneNumber"
            className="w-full rounded-md border px-3 py-2"
            placeholder="+254..."
          />
          <select
            name="provider"
            defaultValue={PaymentProvider.MANUAL_BANK_TRANSFER}
            className="w-full rounded-md border px-3 py-2"
          >
            {Object.values(PaymentProvider).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={PaymentStatus.SUCCEEDED}
            className="w-full rounded-md border px-3 py-2"
          >
            {Object.values(PaymentStatus).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Record payment
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">Payments</h2>
        <PaymentTable payments={payments as BillingPayment[]} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">Invoices</h2>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No invoices found.
          </div>
        ) : (
          <div className="grid gap-3">
            {invoices.map((invoice) => (
              <article
                key={invoice.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h3 className="font-semibold text-slate-950">
                  {invoice.invoiceNumber}: {invoice.title}
                </h3>
                <p className="text-sm text-slate-600">
                  {invoice.student.fullName} · {invoice.payer?.fullName ?? "No payer"}
                </p>
                <p className="text-sm text-slate-700">
                  {formatMoneyMinor(invoice.amountMinor, invoice.currency)} · {invoice.status}
                </p>
                <p className="text-xs text-slate-500">
                  Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueDate)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">Subscriptions</h2>
        {subscriptions.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No subscriptions found.
          </div>
        ) : (
          <div className="grid gap-3">
            {subscriptions.map((subscription) => (
              <article
                key={subscription.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h3 className="font-semibold text-slate-950">{subscription.planName}</h3>
                <p className="text-sm text-slate-600">
                  {subscription.student.fullName} · payer{" "}
                  {subscription.payer?.fullName ?? "not assigned"}
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
