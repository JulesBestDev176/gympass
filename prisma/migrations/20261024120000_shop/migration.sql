BEGIN;
-- CreateTable
CREATE TABLE "shop_products" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "photoUrl" TEXT,
    "priceVersion" INTEGER NOT NULL DEFAULT 1,
    "priceFcfa" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_sales" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "offline" BOOLEAN NOT NULL,
    "mode" TEXT NOT NULL,
    "totalFcfa" INTEGER NOT NULL,
    "stockConflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalFcfa" INTEGER NOT NULL,

    CONSTRAINT "shop_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_stock_movements" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "requestId" TEXT,
    "fingerprint" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_products_gymId_active_idx" ON "shop_products"("gymId", "active");

-- CreateIndex
CREATE INDEX "shop_sales_gymId_occurredAt_idx" ON "shop_sales"("gymId", "occurredAt");

-- CreateIndex
CREATE INDEX "shop_sales_gymId_userId_occurredAt_idx" ON "shop_sales"("gymId", "userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "shop_sales_gymId_requestId_key" ON "shop_sales"("gymId", "requestId");

-- CreateIndex
CREATE INDEX "shop_sale_items_saleId_idx" ON "shop_sale_items"("saleId");

-- CreateIndex
CREATE INDEX "shop_stock_movements_gymId_productId_createdAt_idx" ON "shop_stock_movements"("gymId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "shop_stock_movements_gymId_requestId_key" ON "shop_stock_movements"("gymId", "requestId");

-- AddForeignKey
ALTER TABLE "shop_sale_items" ADD CONSTRAINT "shop_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "shop_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE shop_products ADD CONSTRAINT shop_product_money CHECK ("priceFcfa" >= 0 AND "lowStockThreshold" >= 0);
ALTER TABLE shop_sales ADD CONSTRAINT shop_sale_money CHECK ("totalFcfa" >= 0);
ALTER TABLE shop_sale_items ADD CONSTRAINT shop_line_money CHECK (quantity > 0 AND "unitPrice" >= 0 AND "totalFcfa" = quantity::bigint * "unitPrice");
COMMIT;
