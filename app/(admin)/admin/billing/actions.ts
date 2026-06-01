"use server";

import {
  BillingCycle,
  PaymentProvider,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createBillingPlan,
  createManualPayment,
  createSubscriptionForStudent,
  issueInvoice,
  refundPayment,
  updatePaymentStatus,
} from "@/lib/repositories/billing-repository";

function parsePaymentStatus(status: string): PaymentStatus {
  if (!Object.values(PaymentStatus).includes(status as PaymentStatus)) {
    throw new Error("Invalid payment status");
  }

  return status as PaymentStatus;
}

function revalidateBillingPaths() {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/analytics/inputs");
  revalidatePath("/portal/parent");
  revalidatePath("/portal/parent/billing");
}

function billingFeedbackUrl(type: "billingMessage" | "billingError", message: string) {
  return `/admin/billing?${new URLSearchParams({ [type]: message }).toString()}`;
}

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const planSchema = z.object({
  amountMinor: z.coerce.number().int().min(0),
  currency: z.string().trim().default("KES"),
  cycle: z.nativeEnum(BillingCycle).default(BillingCycle.MONTHLY),
  displayOrder: z.coerce.number().int().default(0),
  name: z.string().trim().min(1),
});

const subscriptionSchema = z.object({
  payerUserId: z.string().trim().optional(),
  planId: z.string().trim().optional(),
  planName: z.string().trim().optional(),
  status: z.nativeEnum(SubscriptionStatus).default(SubscriptionStatus.ACTIVE),
  studentId: z.string().trim().min(1),
});

const invoiceSchema = z.object({
  amountMinor: z.coerce.number().int().min(0),
  currency: z.string().trim().default("KES"),
  description: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  payerUserId: z.string().trim().optional(),
  planId: z.string().trim().optional(),
  studentId: z.string().trim().min(1),
  subscriptionId: z.string().trim().optional(),
  title: z.string().trim().min(1),
});

const manualPaymentSchema = z.object({
  accountReference: z.string().trim().optional(),
  amountMinor: z.coerce.number().int().min(0),
  currency: z.string().trim().default("KES"),
  invoiceId: z.string().trim().optional(),
  payerUserId: z.string().trim().optional(),
  phoneNumber: z.string().trim().optional(),
  provider: z.nativeEnum(PaymentProvider).default(PaymentProvider.MANUAL_BANK_TRANSFER),
  status: z.nativeEnum(PaymentStatus).default(PaymentStatus.SUCCEEDED),
  studentId: z.string().trim().min(1),
  subscriptionId: z.string().trim().optional(),
});

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
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

      const updatedPayment = await updatePaymentStatus(input.paymentId, status, tx);
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
            invoiceId: updatedPayment.invoiceId,
            paymentId: input.paymentId,
            studentId: updatedPayment.studentId,
            subscriptionId: updatedPayment.subscriptionId,
          },
        },
        tx,
      );

      return updatedPayment;
    });
    revalidateBillingPaths();
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update payment status.",
    };
  }
}

export async function refundPaymentAction(input: { paymentId: string }) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const data = await prisma.$transaction(async (tx) => {
      const beforePayment = await tx.paymentTransaction.findUnique({
        where: { id: input.paymentId },
      });
      if (!beforePayment) {
        throw new Error("Payment transaction not found.");
      }
      const updatedPayment = await refundPayment(input.paymentId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PAYMENT_REFUNDED",
          targetType: "payment_transaction",
          targetId: input.paymentId,
          before: { status: beforePayment.status },
          after: { status: updatedPayment.status },
          meta: {
            invoiceId: updatedPayment.invoiceId,
            paymentId: input.paymentId,
            studentId: updatedPayment.studentId,
            subscriptionId: updatedPayment.subscriptionId,
          },
        },
        tx,
      );
      return updatedPayment;
    });
    revalidateBillingPaths();
    return {
      success: true as const,
      data,
      message: "Local refund marker applied. Payment status set to REFUNDED.",
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not process local refund marker.",
    };
  }
}

export async function createBillingPlanAction(formData: FormData) {
  let redirectUrl = billingFeedbackUrl("billingMessage", "Billing plan created.");
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const input = planSchema.parse({
      amountMinor: formValue(formData, "amountMinor"),
      currency: formValue(formData, "currency") ?? "KES",
      cycle: formValue(formData, "cycle") ?? BillingCycle.MONTHLY,
      displayOrder: formValue(formData, "displayOrder") ?? "0",
      name: formValue(formData, "name"),
    });
    await prisma.$transaction(async (tx) => {
      const plan = await createBillingPlan(input, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "BILLING_PLAN_CREATED",
          targetId: plan.id,
          targetType: "billing_plan",
          after: plan,
        },
        tx,
      );
    });
    revalidateBillingPaths();
  } catch (error) {
    redirectUrl = billingFeedbackUrl(
      "billingError",
      actionErrorMessage(error, "Could not create billing plan."),
    );
  }
  redirect(redirectUrl);
}

export async function createSubscriptionAction(formData: FormData) {
  let redirectUrl = billingFeedbackUrl("billingMessage", "Subscription assigned.");
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const input = subscriptionSchema.parse({
      payerUserId: formValue(formData, "payerUserId"),
      planId: formValue(formData, "planId"),
      planName: formValue(formData, "planName"),
      status: formValue(formData, "status") ?? SubscriptionStatus.ACTIVE,
      studentId: formValue(formData, "studentId"),
    });
    await prisma.$transaction(async (tx) => {
      const subscription = await createSubscriptionForStudent(input, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_SUBSCRIPTION_CREATED",
          targetId: subscription.id,
          targetType: "student_subscription",
          after: subscription,
        },
        tx,
      );
    });
    revalidateBillingPaths();
  } catch (error) {
    redirectUrl = billingFeedbackUrl(
      "billingError",
      actionErrorMessage(error, "Could not create subscription."),
    );
  }
  redirect(redirectUrl);
}

export async function issueInvoiceAction(formData: FormData) {
  let redirectUrl = billingFeedbackUrl("billingMessage", "Invoice issued.");
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const input = invoiceSchema.parse({
      amountMinor: formValue(formData, "amountMinor"),
      currency: formValue(formData, "currency") ?? "KES",
      description: formValue(formData, "description"),
      dueDate: formValue(formData, "dueDate"),
      payerUserId: formValue(formData, "payerUserId"),
      planId: formValue(formData, "planId"),
      studentId: formValue(formData, "studentId"),
      subscriptionId: formValue(formData, "subscriptionId"),
      title: formValue(formData, "title"),
    });
    await prisma.$transaction(async (tx) => {
      const invoice = await issueInvoice(
        {
          ...input,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        },
        tx,
      );
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "BILLING_INVOICE_ISSUED",
          targetId: invoice.id,
          targetType: "billing_invoice",
          after: invoice,
        },
        tx,
      );
    });
    revalidateBillingPaths();
  } catch (error) {
    redirectUrl = billingFeedbackUrl(
      "billingError",
      actionErrorMessage(error, "Could not issue invoice."),
    );
  }
  redirect(redirectUrl);
}

export async function createManualPaymentAction(formData: FormData) {
  let redirectUrl = billingFeedbackUrl("billingMessage", "Payment recorded.");
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const input = manualPaymentSchema.parse({
      accountReference: formValue(formData, "accountReference"),
      amountMinor: formValue(formData, "amountMinor"),
      currency: formValue(formData, "currency") ?? "KES",
      invoiceId: formValue(formData, "invoiceId"),
      payerUserId: formValue(formData, "payerUserId"),
      phoneNumber: formValue(formData, "phoneNumber"),
      provider: formValue(formData, "provider") ?? PaymentProvider.MANUAL_BANK_TRANSFER,
      status: formValue(formData, "status") ?? PaymentStatus.SUCCEEDED,
      studentId: formValue(formData, "studentId"),
      subscriptionId: formValue(formData, "subscriptionId"),
    });
    await prisma.$transaction(async (tx) => {
      const payment = await createManualPayment(input, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "MANUAL_PAYMENT_RECORDED",
          targetId: payment.id,
          targetType: "payment_transaction",
          after: payment,
        },
        tx,
      );
    });
    revalidateBillingPaths();
  } catch (error) {
    redirectUrl = billingFeedbackUrl(
      "billingError",
      actionErrorMessage(error, "Could not create manual payment."),
    );
  }
  redirect(redirectUrl);
}

export const processRefundAction = refundPaymentAction;
