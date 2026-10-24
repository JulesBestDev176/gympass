const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepare,columns}=require('./app-releases-preflight.cjs');
function fixture(applied=[],existing=[]) {
 const calls=[];const db={$queryRawUnsafe:async sql=>sql.includes('_prisma_migrations')?applied:existing.map(column_name=>({column_name}))};
 return{db,calls,run:async args=>calls.push(args)};
}
test('new release table applies only its explicit migration and records it',async()=>{
 const f=fixture();await prepare(f.db,f.run);assert.equal(f.calls.length,2);
 assert.equal(f.calls[0][0],'db');assert.ok(f.calls[0].some(arg=>String(arg).includes('20261023210000_app_releases')));assert.deepEqual(f.calls[1].slice(0,4),['migrate','resolve','--applied','20261023210000_app_releases']);
});
test('completed release migration does not execute DDL again',async()=>{
 const f=fixture([{finished_at:new Date()}],columns);await prepare(f.db,f.run);assert.equal(f.calls.length,0);
});
test('partial or unrecorded schemas stop startup without changing data',async()=>{
 for(const f of [fixture([],[columns[0]]),fixture([{finished_at:null}],[]),fixture([{finished_at:new Date()}],[columns[0]])]){
  await assert.rejects(prepare(f.db,f.run));assert.equal(f.calls.length,0);
 }
});
