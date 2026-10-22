require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {MembersService}=require('./members.service.ts');
function fixture(){
 const gyms=new Map(['a','b'].map(id=>[id,{id,nom:'Gyme Dakar Plateau',fraisInscription:15000,memberCounter:0}]));
 const members=[],payments=[],subscriptions=[];let messages=0;
 const db={gym:{findUnique:async({where})=>gyms.get(where.id),update:async({where})=>{const g=gyms.get(where.id);return {...g,memberCounter:++g.memberCounter};}},
 member:{count:async()=>members.length,create:async({data})=>{const row={id:'m'+members.length,...data};members.push(row);return row;},findFirst:async({where})=>members.find(m=>m.id===where.id&&m.gymId===where.gymId),update:async({where,data})=>Object.assign(members.find(m=>m.id===where.id),data)},
 payment:{create:async({data})=>{payments.push(data);return data;}},subscription:{create:async({data})=>{subscriptions.push(data);return data;}},sessionCard:{create:async()=>({})}};
 db.$transaction=async(fn)=>fn(db);
 const service=new MembersService(db,{sendWelcome:async()=>{messages++;}},{createAndPush:async()=>{}});
 return {service,db,gyms,members,payments,subscriptions,messages:()=>messages};
}
const dto={nom:'Diop',prenom:'Awa',telephone:'+221771234567',paiement:{mode:'WAVE'}};
test('a future paid month cannot grant access before its start date',()=>{
 assert.equal(MembersService.computeStatus({carteActive:true,subscriptions:[{formule:'Mensuel',statut:'ACTIF',dateDebut:new Date(Date.now()+86400000*20),dateExpiration:new Date(Date.now()+86400000*50)}]}),'EXPIRE');
});
test('registration collects only the gym registration fee and grants access until calendar month end',async()=>{
 const f=fixture();const before=new Date();const result=await f.service.create('a','staff',dto);
 assert.equal(f.payments.length,1);assert.equal(f.payments[0].type,'INSCRIPTION');assert.equal(f.payments[0].montantFcfa,15000);assert.equal(f.payments[0].mode,'WAVE');assert.equal(f.payments[0].userId,'staff');
 assert.equal(f.subscriptions.length,1);assert.equal(f.subscriptions[0].statut,'ACTIF');
 const end=f.subscriptions[0].dateExpiration;assert.equal(end.getUTCMonth(),before.getUTCMonth());assert.equal(end.getUTCDate(),new Date(Date.UTC(before.getUTCFullYear(),before.getUTCMonth()+1,0)).getUTCDate());
 assert.equal(result.numeroCarte,'GDP-001');assert.equal(f.messages(),0,'welcome is included in the card caption, not sent separately');
});
test('each gym starts at 001 even with identical initials; QRs remain distinct',async()=>{
 const f=fixture();const a=await f.service.create('a','staff',dto);const b=await f.service.create('b','staff',dto);
 assert.equal(a.numeroCarte,'GDP-001');assert.equal(b.numeroCarte,'GDP-001');assert.notEqual(a.qrCode,b.qrCode);
});
test('deleting a member never reuses a matricule, and replacement consumes the same counter',async()=>{
 const f=fixture();const a=await f.service.create('a','staff',dto);await f.service.create('a','staff',dto);f.members.pop();
 const c=await f.service.create('a','staff',dto);assert.equal(c.numeroCarte,'GDP-003');
 const replaced=await f.service.replaceCard('a',a.id);assert.equal(replaced.numeroCarte,'GDP-004');assert.notEqual(replaced.qrCode,c.qrCode);
});
test('concurrent registrations allocate distinct sequential numbers',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:12},()=>f.service.create('a','staff',dto)));
 assert.equal(new Set(results.map(m=>m.numeroCarte)).size,12);assert.ok(results.some(m=>m.numeroCarte==='GDP-012'));
});
test('failed inscription rejects the transaction and sends no welcome',async()=>{
 const f=fixture();f.db.payment.create=async()=>{throw Error('payment unavailable');};
 await assert.rejects(f.service.create('a','staff',dto),/payment unavailable/);assert.equal(f.messages(),0);
});
