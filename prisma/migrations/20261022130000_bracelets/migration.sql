CREATE TABLE "bracelets" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bracelets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bracelet_ventes" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "braceletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "montantFcfa" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bracelet_ventes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bracelets_qrCode_key" ON "bracelets"("qrCode");
CREATE INDEX "bracelets_gymId_idx" ON "bracelets"("gymId");
CREATE INDEX "bracelet_ventes_gymId_idx" ON "bracelet_ventes"("gymId");
CREATE INDEX "bracelet_ventes_braceletId_idx" ON "bracelet_ventes"("braceletId");

ALTER TABLE "bracelets" ADD CONSTRAINT "bracelets_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bracelet_ventes" ADD CONSTRAINT "bracelet_ventes_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bracelet_ventes" ADD CONSTRAINT "bracelet_ventes_braceletId_fkey" FOREIGN KEY ("braceletId") REFERENCES "bracelets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bracelet_ventes" ADD CONSTRAINT "bracelet_ventes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
