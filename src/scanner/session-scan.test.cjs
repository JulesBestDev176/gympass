require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ScannerService}=require('./scanner.service.ts');

function fixture({credits=3,active=true,blocked=false,monthly=false}={}) {
 const card={id:'card',memberId:'member',qrCode:'GYMPASS-CARTE-card',active,seancesRestantes:credits,lastScannedAt:null};
 const member={id:'member',gymId:'gym',carteActive:!blocked,subscriptions:[{formule:monthly?'Mensuel':'Séance',statut:'SEANCE_DISPONIBLE',dateExpiration:new Date(Date.now()+86400000*30)}],sessionCards:[card]};
 let writes=0;
 const db={
  gym:{findUnique:async()=>({antiDoubleScanSec:5})},
  member:{findFirst:async({where})=>where.gymId==='gym'&&where.qrCode==='GYMPASS-SN-member'?member:null},
  sessionCard:{
   findFirst:async({where})=>where.qrCode===card.qrCode&&where.member.gymId==='gym'?{...card,member}:null,
   findUnique:async()=>({...card}),
   updateMany:async({where,data})=>{
    if(!card.active||!member.carteActive||card.seancesRestantes<=0||card.lastScannedAt&&card.lastScannedAt>where.OR[1].lastScannedAt.lte) return {count:0};
    card.seancesRestantes--;card.lastScannedAt=data.lastScannedAt;writes++;return {count:1};
   },
  },
  subscription:{updateMany:async()=>{member.subscriptions[0].statut='SEANCE_CONSOMMEE';return {count:1};}},
  entry:{create:async()=>{throw Error('No attendance should be recorded');}},
 };
 db.$transaction=async fn=>fn(db);
 return {service:new ScannerService(db),member,card,writes:()=>writes};
}
test('session card scan consumes one credit and returns the new balance',async()=>{
 const f=fixture();const r=await f.service.scanMember('gym',f.card.qrCode);
 assert.equal(r.seancesRestantes,2);assert.equal(r.seanceDeduite,true);assert.equal(f.writes(),1);
});
test('repeated concurrent scans deduct once; protection survives a service restart',async()=>{
 const f=fixture();await Promise.all([f.service.scanMember('gym',f.card.qrCode),f.service.scanMember('gym',f.card.qrCode)]);
 assert.equal(f.card.seancesRestantes,2);f.service.lastScan.clear();
 const r=await f.service.scanMember('gym',f.card.qrCode);assert.equal(r.seanceDeduite,false);assert.equal(f.writes(),1);
});
test('another scan after the delay consumes a new session',async()=>{
 const f=fixture();await f.service.scanMember('gym',f.card.qrCode);f.card.lastScannedAt=new Date(Date.now()-6000);
 await f.service.scanMember('gym',f.card.qrCode);assert.equal(f.card.seancesRestantes,1);
});
test('last credit reaches zero and subsequent scans cannot go negative',async()=>{
 const f=fixture({credits:1});const r=await f.service.scanMember('gym',f.card.qrCode);
 assert.equal(r.seancesRestantes,0);assert.equal(r.statut,'SEANCE_CONSOMMEE');
 await f.service.scanMember('gym',f.card.qrCode);assert.equal(f.writes(),1);
});
test('inactive cards and blocked members never consume credits',async()=>{
 for(const options of [{active:false},{blocked:true}]) {const f=fixture(options);await f.service.scanMember('gym',f.card.qrCode);assert.equal(f.writes(),0);}
});
test('member QR consumes for a session formula but monthly QR is consultation only',async()=>{
 const f=fixture();await f.service.scanMember('gym','GYMPASS-SN-member');assert.equal(f.writes(),1);
 const monthly=fixture({monthly:true});await monthly.service.scanMember('gym','GYMPASS-SN-member');assert.equal(monthly.writes(),0);
});
test('a foreign gym cannot consume credits',async()=>{
 const f=fixture();await assert.rejects(f.service.scanMember('other',f.card.qrCode),e=>e.getStatus?.()===404);assert.equal(f.writes(),0);
});
