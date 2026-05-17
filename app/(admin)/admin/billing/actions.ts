"use server";

import { PaymentStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";

function parsePaymentStatus(status: string): PaymentStatus {
  if (!Object.values(PaymentStatus).includes(status as PaymentStatus)) {
    throw new Error("Invalid payment status");
  }

  return status as PaymentStatus;
}

export async function updatePaymentStatusAction(input: { paymentId: string; status: string }) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const status = parsePaymentStatus(input.status);
    const data = await prisma.$transaction(async (tx) => {
      const beforePayment = await tx.paymentTransaction.findUnique({
        where: { id: input.paymentId },
      });
      if (!beforePayment) {
        throw new Error("Payment transaction not found.");
      }

      const updatedPayment = await tx.paymentTransaction.update({
        where: { id: input.paymentId },
        data: { status },
      });
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PAYMENT_STATUS_UPDATED",
          targetType: "payment_transaction",
          targetId: input.paymentId,
          before: { status: beforePayment.status },
          after: { status: updatedPayment.status },
          meta: {
            actorRole: UserRole.ADMIN,
            paymentId: input.paymentId,
            studentId: updatedPayment.studentId,
            subscriptionId: updatedPayment.subscriptionId,
          },
        },
        tx,
      );

      return updatedPayment;
    });
    revalidatePath("/admin/billing");
    revalidatePath("/admin/analytics");
    revalidatePath("/admin/analytics/inputs");
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update payment status.",
    };
  }
}

export async function refundPaymentAction(input: { paymentId: string }) {
  const result = await updatePaymentStatusAction({
    paymentId: input.paymentId,
    status: PaymentStatus.FAILED,
  });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error ?? "Could not process local refund marker.",
    };
  }

  return {
    success: true as const,
    data: result.data,
    message: "Local refund marker applied. Payment status set to FAILED.",
  };
}

export const processRefundAction = refundPaymentAction;
