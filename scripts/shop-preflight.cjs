const {spawnSync}=require('node:child_process');
const path=require('node:path');
const migration='20261024120000_shop';
const expected={"shop_products": ["id", "gymId", "name", "category", "photoUrl", "priceVersion", "priceFcfa", "stock", "lowStockThreshold", "active", "createdAt", "updatedAt"], "shop_sales": ["id", "gymId", "userId", "userName", "requestId", "fingerprint", "deviceId", "occurredAt", "offline", "mode", "totalFcfa", "stockConflict", "createdAt"], "shop_sale_items": ["id", "saleId", "productId", "name", "quantity", "unitPrice", "totalFcfa"], "shop_stock_movements": ["id", "gymId", "productId", "userId", "userName", "requestId", "fingerprint", "kind", "quantity", "reason", "createdAt"]};
async function prepare(db,prisma){
 const applied=await db.$queryRawUnsafe('SELECT finished_at FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',migration);
 const existing=await db.$queryRawUnsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('shop_products','shop_sales','shop_sale_items','shop_stock_movements')");
 const complete=Object.entries(expected).every(([table,names])=>names.every(name=>existing.some(c=>c.table_name===table&&c.column_name===name)));
 if(applied.some(row=>row.finished_at)){if(!complete)throw Error('Shop schema differs from migration; startup stopped.');return;}
 if(applied.length||existing.length)throw Error('Shop migration needs review; no schema changes made.');
 await prisma(['db','execute','--file',path.join(__dirname,'../prisma/migrations',migration,'migration.sql'),'--schema',path.join(__dirname,'../prisma/schema.prisma')]);
 await prisma(['migrate','resolve','--applied',migration,'--schema',path.join(__dirname,'../prisma/schema.prisma')]);
}
module.exports={prepare,expected};
if(require.main===module){const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();prepare(db,async args=>{const r=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),...args],{stdio:'inherit',env:process.env});if(r.error||r.status!==0)throw Error('Shop migration failed; startup stopped.');}).then(()=>console.log('Shop schema ready.')).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());}
