import { PaymentStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  simulateMockMpesaCallbackAction,
  startMockMpesaPaymentAction,
} from "@/app/portal/parent/actions/billing-actions";
import { requireRole } from "@/lib/auth/session";
import { formatMoneyMinor, getParentChildBilling } from "@/lib/repositories/billing-repository";

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
};

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "No date";
  return new Date(date).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function ParentChildBillingPage({ params }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const billing = await getParentChildBilling(session.uid, studentId);
  if (!billing) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <header className="space-y-2">
        <Link
          className="text-sm font-medium text-blue-700 hover:underline"
          href="/portal/parent/billing"
        >
          Back to billing
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          Billing for {billing.student?.fullName}
        </h1>
        <p className="text-sm text-gray-600">
          Read invoices, receipts, subscriptions, and simulate local M-Pesa payments.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Subscriptions</h2>
        {billing.subscriptions.length === 0 ? (
          <output className="block rounded-lg border p-4 text-sm text-gray-500">
            No subscriptions yet.
          </output>
        ) : (
          <div className="grid gap-3">
            {billing.subscriptions.map((subscription) => (
              <article key={subscription.id} className="rounded-lg border bg-white p-4">
                <h3 className="font-semibold">{subscription.planName}</h3>
                <p className="text-sm text-gray-600">Status: {subscription.status}</p>
                <p className="text-sm text-gray-600">
                  Started {formatDate(subscription.startDate)} · Ends{" "}
                  {formatDate(subscription.endDate)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Invoices</h2>
        {billing.invoices.length === 0 ? (
          <output className="block rounded-lg border p-4 text-sm text-gray-500">
            No invoices yet.
          </output>
        ) : (
          <div className="grid gap-3">
            {billing.invoices.map((invoice) => (
              <article key={invoice.id} className="space-y-3 rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {invoice.invoiceNumber}: {invoice.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {formatMoneyMinor(invoice.amountMinor, invoice.currency)} · {invoice.status}
                    </p>
                    <p className="text-xs text-gray-500">
                      Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                  <Link
                    className="text-sm font-semibold text-blue-700 hover:underline"
                    href={`/portal/parent/billing/invoices/${invoice.id}`}
                  >
                    Open invoice
                  </Link>
                </div>
                {invoice.status !== "PAID" ? (
                  <form
                    action={startMockMpesaPaymentAction}
                    className="grid gap-2 rounded-md bg-gray-50 p-3 md:grid-cols-[1fr_1fr_auto]"
                  >
                    <input type="hidden" name="studentId" value={studentId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="amountMinor" value={invoice.amountMinor} />
                    <label className="grid gap-1 text-sm">
                      M-Pesa phone
                      <input
                        name="phoneNumber"
                        className="rounded-md border px-3 py-2"
                        placeholder="+2547..."
                        required
                      />
                    </label>
                    <div className="text-sm text-gray-600 md:self-end">
                      Mock STK Push: {formatMoneyMinor(invoice.amountMinor, invoice.currency)}
                    </div>
                    <button
                      className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white md:self-end"
                      type="submit"
                    >
                      Pay with M-Pesa
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Payments and receipts</h2>
        {billing.payments.length === 0 ? (
          <output className="block rounded-lg border p-4 text-sm text-gray-500">
            No payments yet.
          </output>
        ) : (
          <div className="grid gap-3">
            {billing.payments.map((payment) => (
              <article key={payment.id} className="rounded-lg border bg-white p-4">
                <h3 className="font-semibold">
                  {formatMoneyMinor(
                    payment.amountMinor || Math.round(payment.amount * 100),
                    payment.currency,
                  )}
                </h3>
                <p className="text-sm text-gray-600">
                  {payment.provider} · {payment.status} · {formatDate(payment.paymentDate)}
                </p>
                {payment.mpesaReceiptNumber ? (
                  <p className="text-sm text-gray-600">
                    M-Pesa receipt: {payment.mpesaReceiptNumber}
                  </p>
                ) : null}
                {payment.status === PaymentStatus.PENDING && payment.provider === "MPESA" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={simulateMockMpesaCallbackAction}>
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <input type="hidden" name="success" value="true" />
                      <button
                        className="rounded-md border px-3 py-1.5 text-sm font-semibold"
                        type="submit"
                      >
                        Simulate paid callback
                      </button>
                    </form>
                    <form action={simulateMockMpesaCallbackAction}>
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <input type="hidden" name="success" value="false" />
                      <button
                        className="rounded-md border px-3 py-1.5 text-sm font-semibold"
                        type="submit"
                      >
                        Simulate failed callback
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
