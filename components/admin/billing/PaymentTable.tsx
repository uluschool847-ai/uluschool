"use client";

import { useState } from "react";

import {
  refundPaymentAction,
  updatePaymentStatusAction,
} from "@/app/(admin)/admin/billing/actions";
import { normalizeActionResult } from "@/lib/action-result";

type PaymentStatus =
  | "SUCCESS"
  | "SUCCEEDED"
  | "PENDING"
  | "PROCESSING"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type BillingPayment = {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  amountMinor?: number;
  paymentDate: Date | string;
  provider?: string;
  student?: { fullName: string; email: string } | null;
  payer?: { fullName: string; email: string } | null;
  subscription?: { planName: string } | null;
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PaymentTable({ payments }: { payments: BillingPayment[] }) {
  const [localPayments, setLocalPayments] = useState(payments);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<null | (() => Promise<void>)>(null);

  if (localPayments.length === 0) {
    return (
      <output className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No payments found.
      </output>
    );
  }

  function updateLocalStatus(paymentId: string, status: PaymentStatus) {
    setLocalPayments((current) =>
      current.map((payment) => (payment.id === paymentId ? { ...payment, status } : payment)),
    );
  }

  async function updateStatus(paymentId: string, status: PaymentStatus) {
    setFeedback(null);
    setPendingAction(`status:${paymentId}`);
    setLastAction(() => () => updateStatus(paymentId, status));
    const previousStatus = localPayments.find((payment) => payment.id === paymentId)?.status;
    updateLocalStatus(paymentId, status);

    try {
      const result = normalizeActionResult(
        await updatePaymentStatusAction({ paymentId, status }),
        "Something went wrong",
      );
      if (!result.success) {
        if (previousStatus) {
          updateLocalStatus(paymentId, previousStatus);
        }
        setFeedback({ type: "error", message: result.message });
      } else {
        setFeedback({ type: "success", message: result.message || "Payment status updated" });
      }
    } catch {
      setFeedback({ type: "error", message: "Something went wrong" });
    } finally {
      setPendingAction(null);
    }
  }

  async function refundPayment(paymentId: string) {
    setFeedback(null);
    setPendingAction(`refund:${paymentId}`);
    setLastAction(() => () => refundPayment(paymentId));

    try {
      const result = normalizeActionResult(
        await refundPaymentAction({ paymentId }),
        "Something went wrong",
      );
      if (!result.success) {
        setFeedback({ type: "error", message: result.message });
      } else {
        updateLocalStatus(paymentId, "REFUNDED");
        setFeedback({
          type: "success",
          message: result.message || "Local refund marker applied. Payment status set to REFUNDED.",
        });
      }
    } catch {
      setFeedback({ type: "error", message: "Something went wrong" });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      {feedback ? (
        <div
          role={feedback.type === "error" ? "alert" : undefined}
          className={
            feedback.type === "error"
              ? "border-b border-red-200 bg-red-50 p-3 text-sm text-red-700"
              : "border-b border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
          }
        >
          <p>{feedback.message}</p>
          {feedback.type === "error" ? (
            <button
              type="button"
              aria-label="Retry"
              className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold"
              onClick={() => {
                if (lastAction) {
                  void lastAction();
                }
              }}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <table
        aria-label="Payment transactions"
        aria-busy={pendingAction ? "true" : undefined}
        className="min-w-full divide-y divide-slate-200 text-sm"
      >
        <caption className="sr-only">Payment transactions</caption>
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">
              Student
            </th>
            <th scope="col" className="px-4 py-3">
              Plan
            </th>
            <th scope="col" className="px-4 py-3">
              Amount
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3">
              Date
            </th>
            <th scope="col" className="px-4 py-3">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {localPayments.map((payment) => {
            const statusPending = pendingAction === `status:${payment.id}`;
            const refundPending = pendingAction === `refund:${payment.id}`;
            const disabled = statusPending || refundPending;

            return (
              <tr key={payment.id}>
                <th scope="row" className="px-4 py-3 text-left">
                  <p className="font-medium text-slate-950">
                    {payment.student?.fullName ?? "Unknown student"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {payment.student?.email ?? "Email unavailable"}
                  </p>
                </th>
                <td className="px-4 py-3 text-slate-700">
                  {payment.subscription?.planName ?? "No subscription"}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {formatCurrency(
                    payment.amountMinor ? payment.amountMinor / 100 : payment.amount,
                    payment.currency,
                  )}
                  {payment.provider ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {payment.provider}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <label className="sr-only" htmlFor={`payment-status-${payment.id}`}>
                    Payment status
                  </label>
                  <select
                    id={`payment-status-${payment.id}`}
                    value={payment.status}
                    onChange={(event) =>
                      void updateStatus(payment.id, event.target.value as PaymentStatus)
                    }
                    disabled={disabled}
                    className="rounded-md border border-slate-300 px-2 py-1"
                  >
                    <option value="SUCCESS">SUCCESS</option>
                    <option value="SUCCEEDED">SUCCEEDED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="PROCESSING">PROCESSING</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CANCELLED">CANCELLED</option>
                    <option value="REFUNDED">REFUNDED</option>
                    <option value="PARTIALLY_REFUNDED">PARTIALLY_REFUNDED</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-700">{formatDate(payment.paymentDate)}</td>
                <td className="px-4 py-3">
                  {payment.status === "SUCCESS" || payment.status === "SUCCEEDED" ? (
                    <button
                      type="button"
                      onClick={() => void refundPayment(payment.id)}
                      disabled={disabled}
                      aria-label={`Local refund payment for ${payment.student?.fullName ?? "Unknown student"} (marks status refunded)`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-60"
                    >
                      {refundPending ? "Updating..." : "Local Refund"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void updateStatus(payment.id, "SUCCESS")}
                      disabled={disabled}
                      aria-label={`Set to success for ${payment.student?.fullName ?? "Unknown student"}`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold text-slate-900 disabled:opacity-60"
                    >
                      {statusPending ? "Updating..." : "Set to Success"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
