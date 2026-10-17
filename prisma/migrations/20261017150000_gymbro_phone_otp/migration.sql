-- GymbroUser: add phone OTP fields + make telephone unique

-- Add new fields
ALTER TABLE "gymbro_users"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otpCode" TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMP(3);

-- Dédoublonner les téléphones non-null avant de créer l'index unique
-- (garde la ligne la plus récente en cas de doublon)
DELETE FROM "gymbro_users" a
USING "gymbro_users" b
WHERE a."telephone" IS NOT NULL
  AND a."telephone" = b."telephone"
  AND a."createdAt" < b."createdAt";

-- Make telephone unique (multiple NULLs coexist fine in PostgreSQL unique indexes)
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_users_telephone_key"
  ON "gymbro_users"("telephone");
