ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'SUCCEEDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'TERMLY', 'ONE_TIME');
CREATE TYPE "PaymentProvider" AS ENUM ('MPESA', 'MANUAL_BANK_TRANSFER', 'CASH', 'PAYPAL', 'OTHER');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID');

CREATE TABLE "BillingPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "levelId" TEXT,
  "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudentSubscription" ADD COLUMN "payerUserId" TEXT;
ALTER TABLE "StudentSubscription" ADD COLUMN "planId" TEXT;

ALTER TABLE "PaymentTransaction" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "payerUserId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "amountMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentTransaction" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER';
ALTER TABLE "PaymentTransaction" ADD COLUMN "providerCheckoutRequestId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "providerMerchantRequestId" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "mpesaReceiptNumber" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "accountReference" TEXT;
ALTER TABLE "PaymentTransaction" ADD COLUMN "callbackPayload" JSONB;
ALTER TABLE "PaymentTransaction" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "PaymentTransaction" ALTER COLUMN "currency" SET DEFAULT 'KES';
UPDATE "PaymentTransaction" SET "amountMinor" = ROUND("amount" * 100)::INTEGER WHERE "amountMinor" = 0;

CREATE TABLE "BillingInvoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "payerUserId" TEXT,
  "subscriptionId" TEXT,
  "planId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "dueDate" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");
CREATE INDEX "BillingPlan_isActive_displayOrder_name_idx" ON "BillingPlan"("isActive", "displayOrder", "name");
CREATE INDEX "BillingPlan_levelId_idx" ON "BillingPlan"("levelId");
CREATE INDEX "StudentSubscription_payerUserId_status_idx" ON "StudentSubscription"("payerUserId", "status");
CREATE INDEX "StudentSubscription_planId_idx" ON "StudentSubscription"("planId");
CREATE INDEX "PaymentTransaction_payerUserId_paymentDate_idx" ON "PaymentTransaction"("payerUserId", "paymentDate");
CREATE INDEX "PaymentTransaction_invoiceId_idx" ON "PaymentTransaction"("invoiceId");
CREATE INDEX "PaymentTransaction_provider_status_paymentDate_idx" ON "PaymentTransaction"("provider", "status", "paymentDate");
CREATE INDEX "BillingInvoice_studentId_status_issuedAt_idx" ON "BillingInvoice"("studentId", "status", "issuedAt");
CREATE INDEX "BillingInvoice_payerUserId_status_issuedAt_idx" ON "BillingInvoice"("payerUserId", "status", "issuedAt");
CREATE INDEX "BillingInvoice_subscriptionId_idx" ON "BillingInvoice"("subscriptionId");
CREATE INDEX "BillingInvoice_planId_idx" ON "BillingInvoice"("planId");

ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "StudentSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
