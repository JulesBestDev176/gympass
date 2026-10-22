require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ScannerService}=require('./scanner.service.ts');

function fixture({gymId='gym',carteActive=true,expired=false}={}) {
 const member={id:'member',gymId,prenom:'Awa',nom:'Diop',telephone:'+221770000000',photoUrl:'https://images.example/awa.png',numeroCarte:'GP-2026-001',qrCode:'GYMPASS-SN-GP-2026-001',carteActive,subscriptions:[{formule:'Mensuel',statut:'ACTIF',dateExpiration:new Date(Date.now()+(expired?-10:30)*86400000)}],sessionCards:[{seancesRestantes:5,active:true}]};
 const forbidden=async()=>{throw new Error('Lookup attempted to write to database');};
 const service=new ScannerService({
  member:{findFirst:async({where})=>where.gymId===member.gymId&&where.qrCode===member.qrCode?member:null},
  sessionCard:{findFirst:async({where})=>where.qrCode==='GYMPASS-CARTE-test'&&where.member.gymId===member.gymId?{member}:null,update:forbidden},
  subscription:{updateMany:forbidden},entry:{create:forbidden},
 });
 return {service,member};
}
test('lookup returns full identity, photo, QR and computed subscription status without logging an entry',async()=>{
 const f=fixture();const result=await f.service.lookup('gym',f.member.qrCode);
 assert.equal(result.prenom,'Awa');assert.equal(result.nom,'Diop');assert.equal(result.photoUrl,f.member.photoUrl);
 assert.equal(result.statut,'ACTIF');assert.equal(result.qrCode,f.member.qrCode);
});
test('lookup never consumes a session credit, even when repeated',async()=>{
 const f=fixture();for(let i=0;i<3;i++) await f.service.lookup('gym','GYMPASS-CARTE-test');
 assert.equal(f.member.sessionCards[0].seancesRestantes,5);
});
test('lookup rejects a member belonging to another gym',async()=>{
 const f=fixture({gymId:'other'});await assert.rejects(f.service.lookup('gym',f.member.qrCode),e=>e.getStatus?.()===404);
});
test('lookup rejects a session card belonging to another gym',async()=>{
 const f=fixture({gymId:'other'});await assert.rejects(f.service.lookup('gym','GYMPASS-CARTE-test'),e=>e.getStatus?.()===404);
});
test('expired subscription is computed from its expiration date',async()=>{
 const f=fixture({expired:true});assert.equal((await f.service.lookup('gym',f.member.qrCode)).statut,'EXPIRE');
});
test('disabled card remains disabled and unknown QR is rejected',async()=>{
 const f=fixture({carteActive:false});assert.equal((await f.service.lookup('gym',f.member.qrCode)).statut,'CARTE_DESACTIVEE');
 await assert.rejects(f.service.lookup('gym','unknown'),e=>e.getStatus?.()===404);
});
