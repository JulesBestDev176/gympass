-- AlterTable: ajouter moisCouvert aux paiements
ALTER TABLE "payments" ADD COLUMN "moisCouvert" TEXT;

-- UniqueIndex: un seul paiement par membre/mois
CREATE UNIQUE INDEX "payments_memberId_moisCouvert_key" ON "payments"("memberId", "moisCouvert");
