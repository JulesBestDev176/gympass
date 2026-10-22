const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepare,columns}=require('./staff-release-preflight.cjs');
function fixture(applied=[],names=[],indexes=[{indexname:'users_gymId_telephone_key'}]){
 const calls=[];const db={$queryRawUnsafe:async(sql)=>sql.includes('_prisma_migrations')?applied:sql.includes('information_schema')?names.map(column_name=>({column_name})):indexes};
 return{db,calls,prisma:async(args)=>calls.push(args)};
}
test('fresh staff schema runs only the reviewed SQL and records only its migration',async()=>{const f=fixture();await prepare(f.db,f.prisma);assert.equal(f.calls.length,2);assert.equal(f.calls[0][0],'db');assert.ok(f.calls[0].some(a=>a.endsWith('20261020200000_staff_password_recovery/migration.sql')||a.endsWith('20261020200000_staff_password_recovery\\migration.sql')));assert.deepEqual(f.calls[1].slice(0,4),['migrate','resolve','--applied','20261020200000_staff_password_recovery']);});
test('already applied migration performs no writes',async()=>{const f=fixture([{finished_at:new Date()}],columns);await prepare(f.db,f.prisma);assert.equal(f.calls.length,0);});
test('partial schema or failed migration stops without writing',async()=>{for(const f of [fixture([],columns.slice(0,1)),fixture([{finished_at:null}]),fixture([{finished_at:new Date()}],columns,[])]){await assert.rejects(prepare(f.db,f.prisma));assert.equal(f.calls.length,0);}});
test('SQL failure prevents migration recording and application startup',async()=>{const f=fixture();let calls=0;await assert.rejects(prepare(f.db,async()=>{calls++;throw Error('duplicate phones');}));assert.equal(calls,1);});
