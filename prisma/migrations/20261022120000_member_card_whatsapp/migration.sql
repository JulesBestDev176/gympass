BEGIN;
ALTER TABLE "members"
  ADD COLUMN "cardWhatsappStatus" TEXT,
  ADD COLUMN "cardWhatsappAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "cardWhatsappMessageId" TEXT;
COMMIT;
