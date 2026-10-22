BEGIN;
ALTER TABLE "gyms" ADD COLUMN "memberCounter" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "members_numeroCarte_key";
CREATE UNIQUE INDEX "members_gymId_numeroCarte_key" ON "members"("gymId", "numeroCarte");
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "moisCouvert" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_memberId_moisCouvert_key" ON "payments"("memberId", "moisCouvert");
ALTER TABLE "members" ADD COLUMN "registrationRequestId" TEXT;
CREATE UNIQUE INDEX "members_gymId_registrationRequestId_key" ON "members"("gymId", "registrationRequestId");
COMMIT;
