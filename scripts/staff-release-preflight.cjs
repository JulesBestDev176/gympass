const {spawnSync}=require('node:child_process');
const path=require('node:path');
const migration='20261020200000_staff_password_recovery';
const columns=['otpAttempts','otpRequestedAt','otpWindowStartedAt','otpRequests','passwordResetTokenHash','passwordResetExpiresAt','passwordRenewedAt','authVersion'];

async function prepare(db, prisma) {
  const applied=await db.$queryRawUnsafe('SELECT finished_at FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',migration);
  const existing=await db.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'");
  const count=columns.filter(name=>existing.some(c=>c.column_name===name)).length;
  if(applied.some(row=>row.finished_at)) {
    if(count!==columns.length)throw new Error('Staff schema differs from recorded migration; deployment stopped.');
    const indexes=await db.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='users' AND indexname='users_gymId_telephone_key'");
    if(indexes.length!==1)throw new Error('Staff phone unique index missing; deployment stopped.');
    return;
  }
  if(applied.length||count)throw new Error('Staff migration needs review; no schema changes made.');
  // This one reviewed SQL file is transactional and refuses duplicate phones.
  // Never run migrate deploy: unrelated historical GymBro migrations are excluded.
  await prisma(['db','execute','--file',path.join(__dirname,'../prisma/migrations',migration,'migration.sql'),'--schema',path.join(__dirname,'../prisma/schema.prisma')]);
  await prisma(['migrate','resolve','--applied',migration,'--schema',path.join(__dirname,'../prisma/schema.prisma')]);
}
module.exports={prepare,columns};
if(require.main===module){
  const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
  prepare(db,async(args)=>{
    const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),...args],{stdio:'inherit',env:process.env});
    if(result.error||result.status!==0)throw new Error('Scoped staff migration failed; application will not start.');
  }).then(()=>console.log('Staff schema ready; unrelated migrations and seeds skipped.'))
    .catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
}
