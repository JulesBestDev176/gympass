ALTER TABLE "payments"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "receiptData" JSONB,
  ADD COLUMN "receiptWhatsappStatus" TEXT,
  ADD COLUMN "receiptWhatsappAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "receiptWhatsappMessageId" TEXT,
  ADD COLUMN "receiptWhatsappRecipient" TEXT;

CREATE UNIQUE INDEX "payments_gymId_requestId_key" ON "payments"("gymId", "requestId");
CREATE INDEX "payments_receiptWhatsappStatus_createdAt_idx" ON "payments"("receiptWhatsappStatus", "createdAt");
