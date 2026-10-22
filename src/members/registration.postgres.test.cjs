require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');const {MembersService}=require('./members.service.ts');
test('PostgreSQL allocates per-gym counters atomically, preserves numbers after delete and rolls back failed registration',async()=>{
 const url=process.env.REGISTRATION_TEST_DATABASE_URL;
 if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='15441'||new URL(url).pathname!=='/gympass_registration_test')throw Error('Disposable registration fixture required');
 const db=new PrismaClient({datasources:{db:{url}}});const ids=[];
 try {
  const [a,b]=await Promise.all(['a','b'].map(s=>db.gym.create({data:{nom:'Gyme Dakar Plateau',slug:'registration-'+s+'-'+Date.now(),fraisInscription:15000}})));ids.push(a.id,b.id);
  const user=await db.user.create({data:{gymId:a.id,nom:'Test',prenom:'Staff',email:'registration-'+Date.now()+'@example.test',passwordHash:'fixture'}});
  const service=new MembersService(db,{sendWelcome:async()=>{throw Error('No separate message');}});
  const dto={nom:'Test',prenom:'Member',telephone:'+221770000000',paiement:{mode:'ESPECES'}};
  const rows=await Promise.all(Array.from({length:8},()=>service.create(a.id,user.id,dto)));
  assert.equal(new Set(rows.map(m=>m.numeroCarte)).size,8);assert.ok(rows.some(m=>m.numeroCarte==='GDP-001'));assert.ok(rows.some(m=>m.numeroCarte==='GDP-008'));
  const other=await service.create(b.id,user.id,dto);assert.equal(other.numeroCarte,'GDP-001');assert.notEqual(other.qrCode,rows.find(m=>m.numeroCarte==='GDP-001').qrCode);
  const payments=await db.payment.findMany({where:{gymId:a.id}});assert.equal(payments.length,8);assert.ok(payments.every(p=>p.type==='INSCRIPTION'&&p.montantFcfa===15000));
  const newest=rows.find(m=>m.numeroCarte==='GDP-008');await db.payment.deleteMany({where:{memberId:newest.id}});await db.member.delete({where:{id:newest.id}});
  assert.equal((await service.create(a.id,user.id,dto)).numeroCarte,'GDP-009');
  const count=await db.member.count({where:{gymId:a.id}});await assert.rejects(service.create(a.id,'missing-staff',dto));
  assert.equal(await db.member.count({where:{gymId:a.id}}),count);assert.equal((await db.gym.findUnique({where:{id:a.id}})).memberCounter,9);
  const retryDto={...dto,registrationRequestId:'1234567890abcdef1234567890abcdef'};
  const attempts=await Promise.all([service.create(a.id,user.id,retryDto),service.create(a.id,user.id,retryDto)]);
  assert.equal(attempts[0].id,attempts[1].id,'a timeout retry must not collect another registration payment');
  assert.equal((await db.gym.findUnique({where:{id:a.id}})).memberCounter,10);
  const {PaymentsService}=require('../payments/payments.service.ts');let confirmations=0;
  const paymentsService=new PaymentsService(db,{createAndPush:async()=>{}},{sendPaymentConfirmation:async()=>{confirmations++;}});
  const renewal={memberId:attempts[0].id,type:'ABONNEMENT',mode:'ESPECES',moisCouvert:'2099-01'};
  const renewed=await Promise.allSettled([paymentsService.create(a.id,user.id,renewal),paymentsService.create(a.id,user.id,renewal)]);
  assert.equal(renewed.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await db.subscription.count({where:{memberId:attempts[0].id,dateExpiration:new Date('2099-01-31T23:59:59.999Z')}}),1);
  assert.equal(confirmations,1);
 } finally {await db.payment.deleteMany({where:{gymId:{in:ids}}});await db.gym.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
