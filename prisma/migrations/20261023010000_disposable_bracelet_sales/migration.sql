ALTER TABLE "bracelets" ADD COLUMN "soldAt" TIMESTAMP(3);
UPDATE "bracelets" b SET "soldAt" = (SELECT MIN(v."createdAt") FROM "bracelet_ventes" v WHERE v."braceletId"=b.id)
WHERE EXISTS (SELECT 1 FROM "bracelet_ventes" v WHERE v."braceletId"=b.id);

CREATE TABLE "bracelet_sales" (
  "id" TEXT NOT NULL, "gymId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL, "mode" "PaymentMode",
  "unitPrice" INTEGER NOT NULL, "totalFcfa" INTEGER NOT NULL, "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bracelet_sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bracelet_sales_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bracelet_sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bracelet_sales_gymId_requestId_key" ON "bracelet_sales"("gymId","requestId");
CREATE INDEX "bracelet_sales_gymId_createdAt_idx" ON "bracelet_sales"("gymId","createdAt");
ALTER TABLE "bracelet_ventes" ADD COLUMN "saleId" TEXT, ADD COLUMN "mode" "PaymentMode", ADD COLUMN "disposableKey" TEXT;
CREATE UNIQUE INDEX "bracelet_ventes_disposableKey_key" ON "bracelet_ventes"("disposableKey");
ALTER TABLE "bracelet_ventes" ADD CONSTRAINT "bracelet_ventes_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "bracelet_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
