-- GymbroUser: add phone OTP fields + make telephone unique

-- Add new fields
ALTER TABLE "gymbro_users"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otpCode" TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMP(3);

-- Make telephone unique (nulls are allowed to coexist in PostgreSQL unique indexes)
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_users_telephone_key"
  ON "gymbro_users"("telephone");
