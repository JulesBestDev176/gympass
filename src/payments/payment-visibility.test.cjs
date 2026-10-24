require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PaymentsService}=require('./payments.service.ts');
const {MembersService}=require('../members/members.service.ts');

test('receptionist payment statistics stay inside their own current week',async()=>{
 const seen=[];
 const db={payment:{aggregate:async q=>{seen.push(q.where);return{_sum:{montantFcfa:0}};},count:async q=>{seen.push(q.where);return 0;}}};
 await new PaymentsService(db,{},{}).getStats('a','reception-a','GERANT');
 for(const where of seen){assert.equal(where.gymId,'a');assert.equal(where.userId,'reception-a');assert.ok(where.createdAt.lt instanceof Date);}
});
test('member details cannot bypass receptionist financial visibility',async()=>{
 let query;
 const service=new MembersService({member:{findFirst:async q=>{query=q;return{carteActive:true,subscriptions:[]};}}},{},{});
 await service.findOne('a','member-a',{id:'reception-a',role:'GERANT'});
 assert.equal(query.include.payments.where.gymId,'a');
 assert.equal(query.include.payments.where.userId,'reception-a');
 assert.ok(query.include.payments.where.createdAt.gte instanceof Date);
 assert.ok(query.include.payments.where.createdAt.lt instanceof Date);
});
