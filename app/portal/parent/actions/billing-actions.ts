"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  createMockMpesaPaymentForParent,
  simulateMockMpesaCallbackForParent,
} from "@/lib/repositories/billing-repository";

const startMpesaSchema = z.object({
  amountMinor: z.coerce.number().int().min(1),
  invoiceId: z.string().trim().optional(),
  phoneNumber: z.string().trim().min(7),
  studentId: z.string().trim().min(1),
  subscriptionId: z.string().trim().optional(),
});

const callbackSchema = z.object({
  paymentId: z.string().trim().min(1),
  success: z.boolean(),
});

function revalidateParentBilling(studentId?: string) {
  revalidatePath("/portal/parent");
  revalidatePath("/portal/parent/billing");
  if (studentId) {
    revalidatePath(`/portal/parent/billing/${studentId}`);
  }
}

export async function startMockMpesaPaymentAction(formData: FormData) {
  try {
    const session = await requireRole([UserRole.PARENT]);
    const input = startMpesaSchema.parse({
      amountMinor: formData.get("amountMinor"),
      invoiceId: formData.get("invoiceId") || undefined,
      phoneNumber: formData.get("phoneNumber"),
      studentId: formData.get("studentId"),
      subscriptionId: formData.get("subscriptionId") || undefined,
    });
    await createMockMpesaPaymentForParent({
      amountMinor: input.amountMinor,
      invoiceId: input.invoiceId,
      parentId: session.uid,
      phoneNumber: input.phoneNumber,
      studentId: input.studentId,
      subscriptionId: input.subscriptionId,
    });
    revalidateParentBilling(input.studentId);
  } catch (error) {
    console.error("Failed to start mock M-Pesa payment", error);
  }
}

export async function simulateMockMpesaCallbackAction(formData: FormData) {
  try {
    const session = await requireRole([UserRole.PARENT]);
    const input = callbackSchema.parse({
      paymentId: formData.get("paymentId"),
      success: formData.get("success") === "true",
    });
    await simulateMockMpesaCallbackForParent(session.uid, input);
    revalidateParentBilling();
  } catch (error) {
    console.error("Failed to simulate mock M-Pesa callback", error);
  }
}
