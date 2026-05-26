import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { formatMoneyMinor, getInvoiceForParent } from "@/lib/repositories/billing-repository";

type PageProps = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "No date";
  return new Date(date).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function ParentInvoicePage({ params }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { invoiceId } = await params;
  const invoice = await getInvoiceForParent(session.uid, invoiceId);
  if (!invoice) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <Link
          className="text-sm font-medium text-blue-700 hover:underline"
          href={`/portal/parent/billing/${invoice.studentId}`}
        >
          Back to child billing
        </Link>
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Invoice</p>
        <h1 className="text-3xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
      </header>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{invoice.title}</h2>
        <p className="text-sm text-gray-600">{invoice.description ?? "No invoice description."}</p>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-gray-500">Student</dt>
            <dd className="font-medium">{invoice.student.fullName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Amount</dt>
            <dd className="font-medium">
              {formatMoneyMinor(invoice.amountMinor, invoice.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium">{invoice.status}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Due date</dt>
            <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Receipt history</h2>
        {invoice.payments.length === 0 ? (
          <output className="block text-sm text-gray-500">No receipt yet.</output>
        ) : (
          <div className="grid gap-2">
            {invoice.payments.map((payment) => (
              <article key={payment.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium">
                  {formatMoneyMinor(
                    payment.amountMinor || Math.round(payment.amount * 100),
                    payment.currency,
                  )}
                </p>
                <p className="text-gray-600">
                  {payment.provider} · {payment.status} · {formatDate(payment.paymentDate)}
                </p>
                {payment.mpesaReceiptNumber ? (
                  <p className="text-gray-600">M-Pesa receipt: {payment.mpesaReceiptNumber}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
