require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');const {ScannerService}=require('./scanner.service.ts');
test('mobile lookup returns a same-gym member without recording attendance and refuses foreign cards',async()=>{
 const service=new ScannerService({member:{findFirst:async({where})=>where.gymId==='gym'&&where.qrCode==='GYMPASS-SN-gym-GDP-001'?{id:'member',carteActive:true,subscriptions:[{formule:'Mensuel',dateExpiration:new Date(Date.now()+86400000*10)}]}:null}});
 assert.equal((await service.lookup('gym','GYMPASS-SN-gym-GDP-001')).statut,'ACTIF');
 await assert.rejects(service.lookup('other','GYMPASS-SN-gym-GDP-001'),e=>e.getStatus()===404);
});
test('legacy session-card QR still resolves its same-gym member',async()=>{
 const service=new ScannerService({sessionCard:{findFirst:async({where})=>where.member.gymId==='gym'?{member:{id:'member',carteActive:true,subscriptions:[]}}:null}});
 assert.equal((await service.lookup('gym','GYMPASS-CARTE-old')).id,'member');
 await assert.rejects(service.lookup('other','GYMPASS-CARTE-old'),e=>e.getStatus()===404);
});
