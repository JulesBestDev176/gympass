require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PlatformBillingService } = require('./platform-billing.service.ts');
const { BillingAdminGuard } = require('./billing-admin.guard.ts');
function fixtureUrl(){ const url=new URL(process.env.BILLING_TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15439');assert.equal(url.pathname,'/gympass_billing_test');return url.href; }
test('billing admin requires ADMIN, configured allowlist and matching server secret', () => {
 const guard = new BillingAdminGuard({get:k=>({GYMDASH_SECRET:'fixture-secret',GYMDASH_BILLING_ADMIN_EMAILS:'admin@example.invalid'})[k]});
 const context = user => ({switchToHttp:()=>({getRequest:()=>({user,headers:{'x-gymdash-secret':'fixture-secret'}})})});
 assert.equal(guard.canActivate(context({email:'admin@example.invalid',role:'ADMIN'})),true);
 assert.throws(()=>guard.canActivate(context({email:'other@example.invalid',role:'ADMIN'})));
 assert.throws(()=>guard.canActivate(context({email:'admin@example.invalid',role:'GERANT'})));
 assert.throws(()=>new BillingAdminGuard({get:()=>''}).canActivate(context({email:'admin@example.invalid',role:'ADMIN'})));
});
test('PostgreSQL16 ledger: partial settlement, immutable snapshots, idempotency, cancellation and concurrent renewal', {skip:!process.env.BILLING_TEST_DATABASE_URL}, async t=>{
 const url=new URL(process.env.BILLING_TEST_DATABASE_URL); assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.port,'15439'); assert.equal(url.pathname,'/gympass_billing_test');
 const db=new PrismaClient({datasources:{db:{url:url.href}}}); t.after(()=>db.$disconnect());
 const service=new PlatformBillingService(db); const gymId='billing-fixture-'+randomUUID();
 await db.gym.create({data:{id:gymId,nom:'Salle fictive',slug:gymId}});
 await service.updateSettings({monthlyPriceFcfa:10000,issuerName:'Émetteur fictif'});
 await service.updateGym(gymId,{enabled:false,monthlyPriceFcfa:null});
 await db.gymBillingAccount.update({where:{gymId},data:{activatedAt:new Date('2020-01-01')}});
 const key=randomUUID(); const invoice=await service.createInvoice({gymId,months:2,paid:false,idempotencyKey:key},'fixture-admin');
 assert.ok((await db.gymBillingAccount.findUnique({where:{gymId}})).activatedAt.getTime()>Date.now()-10000);
 assert.equal(invoice.totalFcfa,20000); assert.equal(invoice.status,'UNPAID');
 assert.equal((await service.createInvoice({gymId,months:2,paid:false,idempotencyKey:key},'fixture-admin')).id,invoice.id);
 await assert.rejects(service.createInvoice({gymId,months:3,paid:false,idempotencyKey:key},'fixture-admin'),e=>e.status===409);
 const pkey=randomUUID(); const partial=await service.recordPayment(invoice.id,{amountFcfa:5000,mode:'WAVE',idempotencyKey:pkey},'fixture-admin');
 assert.equal(partial.status,'PARTIALLY_PAID'); assert.equal((await db.gymBillingAccount.findUnique({where:{gymId}})).paidUntil,null);
 assert.equal((await service.recordPayment(invoice.id,{amountFcfa:5000,mode:'WAVE',idempotencyKey:pkey},'fixture-admin')).paidFcfa,5000);
 await assert.rejects(service.cancelInvoice(invoice.id,{reason:'Impossible'}));
 await assert.rejects(service.recordPayment(invoice.id,{amountFcfa:15001,mode:'WAVE',idempotencyKey:randomUUID()},'fixture-admin'));
 const paid=await service.recordPayment(invoice.id,{amountFcfa:15000,mode:'ESPECES',idempotencyKey:randomUUID()},'fixture-admin'); assert.equal(paid.status,'PAID'); assert.ok(paid.coveredUntil);
 const renewals=await Promise.all([1,2].map(()=>service.createInvoice({gymId,months:1,paid:true,mode:'WAVE',idempotencyKey:randomUUID()},'fixture-admin')));
 assert.notEqual(renewals[0].number,renewals[1].number); const sorted=renewals.sort((a,b)=>a.coveredFrom.localeCompare(b.coveredFrom)); assert.equal(sorted[0].coveredUntil,sorted[1].coveredFrom);
 await service.updateSettings({issuerName:'Nouvel émetteur'}); assert.equal((await service.getInvoice(invoice.id)).issuer.name,'Émetteur fictif');
 const pending=await service.createInvoice({gymId,months:1,paid:false,idempotencyKey:randomUUID()},'fixture-admin'); assert.equal((await service.cancelInvoice(pending.id,{reason:'Erreur de saisie'})).status,'CANCELLED');
 const pdf=await service.invoicePdf(invoice.id); assert.equal(pdf.subarray(0,4).toString(),'%PDF');
});

test('real Nest HTTP authentication rejects gym ADMIN and secret-only callers', {skip:!process.env.BILLING_TEST_DATABASE_URL}, async t=>{
 require('reflect-metadata');
 const { Test }=require('@nestjs/testing'); const { ConfigModule }=require('@nestjs/config'); const { PassportModule }=require('@nestjs/passport');
 const { JwtStrategy }=require('../auth/strategies/jwt.strategy.ts'); const { PrismaService }=require('../prisma/prisma.service.ts');
 const { PlatformBillingModule }=require('./platform-billing.module.ts'); const { BillingAccessModule }=require('./access.module.ts');
 const jwt=require('jsonwebtoken');
 const db=new PrismaClient({datasources:{db:{url:fixtureUrl()}}});t.after(()=>db.$disconnect());
 const tag=randomUUID();const gym=await db.gym.create({data:{nom:'HTTP fictive',slug:'http-'+tag}});
 const account=await db.gymBillingAccount.create({data:{gymId:gym.id,enabled:true,activatedAt:new Date('2020-01-01')}});
 const admin=await db.user.create({data:{gymId:gym.id,nom:'Fixture',prenom:'Admin',email:`platform-${tag}@example.invalid`,passwordHash:'unused',role:'ADMIN'}});
 const other=await db.user.create({data:{gymId:gym.id,nom:'Fixture',prenom:'Gym',email:`gym-${tag}@example.invalid`,passwordHash:'unused',role:'ADMIN'}});
 const config={JWT_SECRET:'local-fixture-jwt-secret',GYMDASH_SECRET:'local-fixture-server-secret',GYMDASH_BILLING_ADMIN_EMAILS:admin.email};
 const module=await Test.createTestingModule({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,load:[()=>config]}),PassportModule,PlatformBillingModule,BillingAccessModule],providers:[JwtStrategy]}).overrideProvider(PrismaService).useValue(db).compile();
 const app=module.createNestApplication();app.setGlobalPrefix('api/v1');await app.listen(0,'127.0.0.1');t.after(()=>app.close());const origin=await app.getUrl();
 const token=user=>jwt.sign({sub:user.id,email:user.email},config.JWT_SECRET,{expiresIn:'5m'});
 const request=async(headers={},path='/api/v1/platform-billing/overview',options={})=>fetch(origin+path,{headers,...options});
 assert.equal((await request({'x-gymdash-secret':config.GYMDASH_SECRET})).status,401);
 assert.equal((await request({Authorization:'Bearer invalid','x-gymdash-secret':config.GYMDASH_SECRET})).status,401);
 const platformHeaders={Authorization:'Bearer '+token(admin),'x-gymdash-secret':config.GYMDASH_SECRET};
 assert.equal((await request(platformHeaders)).status,200);
 assert.equal((await request({Authorization:'Bearer '+token(admin)})).status,402);
 const denied=await request({Authorization:'Bearer '+token(other),'x-gymdash-secret':config.GYMDASH_SECRET});assert.ok([402,403].includes(denied.status));
 const result=await request(platformHeaders,'/api/v1/platform-billing/settings',{method:'PATCH',body:JSON.stringify({graceDays:91}),headers:{...platformHeaders,'Content-Type':'application/json'}});assert.equal(result.status,400);
 assert.equal((await request(platformHeaders)).headers.get('cache-control'),'private, no-store');
});


test('PostgreSQL16 transaction rollback, concurrent identical commands and calendar anchor', {skip:!process.env.BILLING_TEST_DATABASE_URL}, async t=>{
 const db=new PrismaClient({datasources:{db:{url:fixtureUrl()}}});t.after(()=>db.$disconnect());const service=new PlatformBillingService(db);const gymId='rollback-'+randomUUID();
 await db.gym.create({data:{id:gymId,nom:'Rollback fictif',slug:gymId}});await service.updateSettings({monthlyPriceFcfa:10000,issuerName:'Fictif'});
 const body={gymId,months:1,paid:false,idempotencyKey:randomUUID()};const copies=await Promise.all([service.createInvoice(body,'fixture'),service.createInvoice(body,'fixture')]);assert.equal(copies[0].id,copies[1].id);
 const invoice=copies[0];
 await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION billing_fixture_fail_payment() RETURNS trigger AS $$ BEGIN IF NEW."recordedById" = 'rollback-fixture' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
 await db.$executeRawUnsafe(`CREATE TRIGGER billing_fixture_fail_payment BEFORE INSERT ON platform_billing_payments FOR EACH ROW EXECUTE FUNCTION billing_fixture_fail_payment()`);
 try{
  const counterBefore=await db.platformInvoiceCounter.findUnique({where:{year:new Date().getUTCFullYear()}});
  const invoicesBefore=await db.platformInvoice.count(); const failedKey=randomUUID();
  await assert.rejects(service.createInvoice({gymId,months:1,paid:true,mode:'WAVE',idempotencyKey:failedKey},'rollback-fixture'));
  assert.equal(await db.platformInvoice.count(),invoicesBefore);
  assert.equal((await db.platformInvoiceCounter.findUnique({where:{year:new Date().getUTCFullYear()}})).value,counterBefore.value);
  assert.equal(await db.platformBillingCommand.findUnique({where:{key:failedKey}}),null);
  await assert.rejects(service.recordPayment(invoice.id,{amountFcfa:10000,mode:'WAVE',idempotencyKey:randomUUID()},'rollback-fixture'));
  assert.equal((await service.getInvoice(invoice.id)).paidFcfa,0);assert.equal((await db.gymBillingAccount.findUnique({where:{gymId}})).paidUntil,null);
 }finally{await db.$executeRawUnsafe('DROP TRIGGER billing_fixture_fail_payment ON platform_billing_payments');await db.$executeRawUnsafe('DROP FUNCTION billing_fixture_fail_payment()');}
 const from=new Date();from.setUTCFullYear(from.getUTCFullYear()+1);from.setUTCMonth(0,31);from.setUTCHours(12,0,0,0);
 await db.gymBillingAccount.update({where:{gymId},data:{paidUntil:from,anchorDay:31}});
 const first=await service.recordPayment(invoice.id,{amountFcfa:10000,mode:'WAVE',idempotencyKey:randomUUID()},'fixture');assert.equal(new Date(first.coveredUntil).getUTCMonth(),1);
 const next=await service.createInvoice({gymId,months:1,paid:true,mode:'WAVE',idempotencyKey:randomUUID()},'fixture');assert.equal(new Date(next.coveredUntil).getUTCDate(),31);assert.equal(new Date(next.coveredUntil).getUTCMonth(),2);
 const pending=await service.createInvoice({gymId,months:1,paid:false,idempotencyKey:randomUUID()},'fixture');
 const payments=await Promise.all([4000,6000].map(amountFcfa=>service.recordPayment(pending.id,{amountFcfa,mode:'WAVE',idempotencyKey:randomUUID()},'fixture')));assert.equal((await service.getInvoice(pending.id)).paidFcfa,10000);assert.equal((await service.getInvoice(pending.id)).payments.length,2);
 const sequence=await db.platformInvoice.findMany({where:{gymId},orderBy:{number:'asc'}});assert.equal(new Set(sequence.map(i=>i.number)).size,sequence.length);
 const pdf=await service.invoicePdf(invoice.id);require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'gympass-billing-fixture-sample.pdf'),pdf);
});



test('cancelled PDF preserves original total and reason while showing no amount due', async ()=>{
 const {renderInvoice}=require('./invoice-pdf.ts');
 const invoice={number:'GP-2026-000001',issuedAt:'2026-10-17T00:00:00.000Z',issuer:{name:'Fixture issuer'},customer:{name:'Fixture customer'},months:2,unitPriceFcfa:10000,totalFcfa:20000,paidFcfa:0,status:'CANCELLED',payments:[],cancellationReason:'Erreur de saisie fixture'};
 const pdf=await renderInvoice(invoice,'');
 // Read real PDFKit compressed text operators; preserve the text split across kerning runs.
 let content='';for(const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)){
  let stream;try{stream=require('node:zlib').inflateSync(Buffer.from(match[1],'latin1')).toString('latin1');}catch{continue;}
  for(const hex of stream.matchAll(/<([0-9a-f]+)>/gi))content+=Buffer.from(hex[1],'hex').toString('latin1');
 }
 assert.ok(content.includes('Total : 20 000 FCFA'),content);
 assert.ok(content.includes('Erreur de saisie fixture'),content);
 assert.ok(content.includes('Aucun montant dû'),content);
 assert.ok(!content.includes('Solde : 20 000 FCFA'),content);
});
