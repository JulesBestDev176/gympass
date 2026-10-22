const {spawnSync}=require('node:child_process');const path=require('node:path');
const migration='20261022130000_bracelets';
const columns=['bracelets', 'bracelet_ventes'];
async function prepare(db,prisma){
 const applied=await db.$queryRawUnsafe('SELECT finished_at FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',migration);
 const existing=await db.$queryRawUnsafe("SELECT table_name AS column_name FROM information_schema.tables WHERE table_schema='public'");
 const count=columns.filter(name=>existing.some(c=>c.column_name===name)).length;
 if(applied.some(row=>row.finished_at)){if(count!==columns.length)throw Error('Bracelet sales schema differs from migration; startup stopped.');return;}
 if(applied.length||count)throw Error('Bracelet sales migration needs review; no schema changes made.');
 await prisma(['db','execute','--file',path.join(__dirname,'../prisma/migrations',migration,'migration.sql'),'--schema',path.join(__dirname,'../prisma/schema.prisma')]);
 await prisma(['migrate','resolve','--applied',migration,'--schema',path.join(__dirname,'../prisma/schema.prisma')]);
}
module.exports={prepare,columns};
if(require.main===module){const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();prepare(db,async args=>{const r=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),...args],{stdio:'inherit',env:process.env});if(r.error||r.status!==0)throw Error('Bracelet sales migration failed; startup stopped.');}).then(()=>console.log('Bracelet sales delivery schema ready.')).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());}
