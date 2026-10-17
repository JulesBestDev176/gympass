-- CreateEnum
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "platform_billing_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "monthlyPriceFcfa" INTEGER,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "issuerName" TEXT NOT NULL DEFAULT '',
    "issuerAddress" TEXT NOT NULL DEFAULT '',
    "issuerEmail" TEXT NOT NULL DEFAULT '',
    "issuerPhone" TEXT NOT NULL DEFAULT '',
    "issuerTaxId" TEXT NOT NULL DEFAULT '',
    "invoiceFooter" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "platform_billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_billing_accounts" (
    "gymId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidUntil" TIMESTAMP(3),
    "anchorDay" INTEGER,
    "monthlyPriceFcfa" INTEGER,
    "billingName" TEXT NOT NULL DEFAULT '',
    "billingAddress" TEXT NOT NULL DEFAULT '',
    "billingEmail" TEXT NOT NULL DEFAULT '',
    "billingPhone" TEXT NOT NULL DEFAULT '',
    "billingTaxId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "gym_billing_accounts_pkey" PRIMARY KEY ("gymId")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "gymName" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "unitPriceFcfa" INTEGER NOT NULL,
    "totalFcfa" INTEGER NOT NULL,
    "paidFcfa" INTEGER NOT NULL DEFAULT 0,
    "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coveredFrom" TIMESTAMP(3),
    "coveredUntil" TIMESTAMP(3),
    "issuer" JSONB NOT NULL,
    "customer" JSONB NOT NULL,
    "footer" TEXT NOT NULL,
    "cancellationReason" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,

    CONSTRAINT "platform_billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_commands" (
    "key" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "platform_billing_commands_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "platform_invoice_counters" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "platform_invoice_counters_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_number_key" ON "platform_invoices"("number");

-- CreateIndex
CREATE INDEX "platform_invoices_gymId_issuedAt_idx" ON "platform_invoices"("gymId", "issuedAt");

-- CreateIndex
CREATE INDEX "platform_invoices_status_issuedAt_idx" ON "platform_invoices"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "platform_billing_payments_invoiceId_idx" ON "platform_billing_payments"("invoiceId");

-- AddForeignKey
ALTER TABLE "gym_billing_accounts" ADD CONSTRAINT "gym_billing_accounts_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_billing_payments" ADD CONSTRAINT "platform_billing_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "platform_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_billing_commands" ADD CONSTRAINT "platform_billing_commands_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "platform_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
