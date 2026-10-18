-- Ensure phone OTP columns exist (idempotent — safe even if already applied)
ALTER TABLE "gymbro_users"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otpCode" TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMP(3);

-- Deduplicate telephones before unique index (keep most recent row)
DELETE FROM "gymbro_users" a
USING "gymbro_users" b
WHERE a."telephone" IS NOT NULL
  AND a."telephone" = b."telephone"
  AND a."createdAt" < b."createdAt";

-- Unique index on telephone (multiple NULLs coexist fine in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_users_telephone_key"
  ON "gymbro_users"("telephone");
