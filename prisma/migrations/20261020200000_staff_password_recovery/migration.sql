-- No accounts are merged, deleted or assigned fictitious phone numbers.
BEGIN;
-- NULL is kept for legacy accounts; contact completion is required for recovery.
CREATE TEMP TABLE staff_phone_normalization ON COMMIT DROP AS
SELECT "id", "gymId", CASE
  WHEN digits ~ '^7[05678][0-9]{7}$' THEN '+221' || digits
  WHEN digits ~ '^07[05678][0-9]{7}$' THEN '+221' || substring(digits FROM 2)
  WHEN digits ~ '^2217[05678][0-9]{7}$' THEN '+' || digits
  WHEN digits ~ '^002217[05678][0-9]{7}$' THEN '+' || substring(digits FROM 3)
  ELSE NULLIF(trim("telephone"), '') END AS normalized
FROM (SELECT *, regexp_replace(coalesce("telephone", ''), '[^0-9]', '', 'g') AS digits FROM "users") u;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM staff_phone_normalization WHERE normalized IS NOT NULL
    GROUP BY "gymId", normalized HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate staff phones within a gym. Resolve reported conflicts with scripts/audit-staff-phones.cjs before applying this migration; no accounts have been modified.';
  END IF;
END $$;
UPDATE "users" u SET "telephone" = n.normalized FROM staff_phone_normalization n WHERE u."id" = n."id";

ALTER TABLE "users"
  ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "otpRequestedAt" TIMESTAMP(3),
  ADD COLUMN "otpWindowStartedAt" TIMESTAMP(3),
  ADD COLUMN "otpRequests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "passwordResetTokenHash" TEXT,
  ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3),
  ADD COLUMN "passwordRenewedAt" TIMESTAMP(3),
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
-- Previously issued plaintext OTPs are invalidated.
UPDATE "users" SET "otpCode" = NULL, "otpExpiresAt" = NULL;
CREATE UNIQUE INDEX "users_gymId_telephone_key" ON "users"("gymId", "telephone");
COMMIT;
