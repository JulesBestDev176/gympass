require('ts-node/register/transpile-only');
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { BillingAccessService }=require('./access.service.ts');
const { isPlatformManagementRequest }=require('./control-access.ts');
const config={get:key=>({GYMDASH_SECRET:'private-key',GYMDASH_BILLING_ADMIN_EMAILS:'platform@example.test'})[key]};
const user={role:'ADMIN',email:'platform@example.test',gymId:'gym'};
test('management bypass requires allowlisted ADMIN, private secret and control-plane path together',()=>{
assert.equal(isPlatformManagementRequest(user,{'x-gymdash-secret':'private-key'},'/api/v1/platform-billing/overview',config),true);
assert.equal(isPlatformManagementRequest(user,{'x-gymdash-secret':'private-key'},'/api/v1/dashboard/global/analytics?period=30d',config),true);
for(const [u,h,p] of [
[{...user,email:'owner@example.test'},{'x-gymdash-secret':'private-key'},'/api/v1/platform-billing/overview'],
[{...user,role:'GERANT'},{'x-gymdash-secret':'private-key'},'/api/v1/platform-billing/overview'],
[user,{},'/api/v1/platform-billing/overview'],
[user,{'x-gymdash-secret':'private-key'},'/api/v1/scanner/scan'],
[user,{'x-gymdash-secret':'private-key'},'/api/v1/members'],
]) assert.equal(isPlatformManagementRequest(u,h,p,config),false);
});
test('unconfigured and disabled gyms stay accessible while expired gyms return402 immediately',async()=>{
let account=null;
const prisma={gymBillingAccount:{findUnique:async()=>account},platformBillingSettings:{findUnique:async()=>({graceDays:7})}};
const service=new BillingAccessService(prisma);
await service.assertAllowed('gym',new Date('2026-03-01'));
account={enabled:false,activatedAt:new Date('2026-01-01'),paidUntil:null};await service.assertAllowed('gym',new Date('2026-03-01'));
account={enabled:true,activatedAt:new Date('2026-01-01'),paidUntil:new Date('2026-02-01')};
await assert.rejects(service.assertAllowed('gym',new Date('2026-02-08')),e=>e.getStatus()===402 && e.getResponse().code==='GYM_SUBSCRIPTION_EXPIRED');
account.paidUntil=new Date('2026-04-01');await service.assertAllowed('gym',new Date('2026-03-01'));
});
test('billing database failure denies operations instead of silently disabling enforcement',async()=>{
await assert.rejects(new BillingAccessService({gymBillingAccount:{findUnique:async()=>{throw Error('private-db-password');}}}).assertAllowed('gym'),e=>e.getStatus()===503 && !JSON.stringify(e.getResponse()).includes('private-db-password'));
});
test('existing JWT sessions are blocked at operations, but account security and platform renewal remain accessible',async t=>{
const {Module,Controller,Get,Post,UseGuards}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const {ConfigService}=require('@nestjs/config');
const {JwtService}=require('@nestjs/jwt');
const {JwtAuthGuard}=require('../auth/guards/jwt-auth.guard.ts');
const {JwtStrategy}=require('../auth/strategies/jwt.strategy.ts');
const {PrismaService}=require('../prisma/prisma.service.ts');
class TestController {operation(){return {ok:true};}me(){return {ok:true};}billing(){return {ok:true};}}
Controller()(TestController);UseGuards(JwtAuthGuard)(TestController);
for(const [method,path] of [['operation','members'],['me','auth/me'],['billing','platform-billing/overview']]) Get(path)(TestController.prototype,method,Object.getOwnPropertyDescriptor(TestController.prototype,method));
let blocked=true;let checks=0;
const check={assertAllowed:async()=>{checks++;if(blocked)throw new (require('@nestjs/common').HttpException)('Expired',402);}};
class TestModule{}
Module({controllers:[TestController],providers:[JwtStrategy,
{provide:ConfigService,useValue:new ConfigService({JWT_SECRET:'billing-test-secret',GYMDASH_SECRET:'private-key',GYMDASH_BILLING_ADMIN_EMAILS:'platform@example.test'})},
{provide:PrismaService,useValue:{user:{findUnique:async({where})=>({id:where.id,actif:true,gymId:'gym',role:'ADMIN',email:where.id==='platform'?'platform@example.test':'owner@example.test'})}}},
{provide:BillingAccessService,useValue:check},]})(TestModule);
const app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,'127.0.0.1');t.after(()=>app.close());
const origin=await app.getUrl();const jwt=new JwtService({secret:'billing-test-secret'});
const request=(path,id='owner',secret)=>fetch(origin+'/'+path,{headers:{Authorization:'Bearer '+jwt.sign({sub:id}),...(secret?{'x-gymdash-secret':secret}:{})}});
assert.equal((await request('members')).status,402);
assert.equal((await request('auth/me')).status,200);
assert.equal((await request('platform-billing/overview','platform','private-key')).status,200);
assert.equal((await request('platform-billing/overview','owner','private-key')).status,402);
blocked=false;assert.equal((await request('members')).status,200);assert.ok(checks>=3);
});

test('legacy management routes cannot bypass gym billing using only the shared secret',async t=>{
const {Module,Controller,Get,UseGuards}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');
const {ConfigService}=require('@nestjs/config');const {JwtService}=require('@nestjs/jwt');
const {GymDashGuard}=require('../auth/guards/gymdash.guard.ts');const {JwtStrategy}=require('../auth/strategies/jwt.strategy.ts');const {PrismaService}=require('../prisma/prisma.service.ts');
class Control {read(){return {ok:true};}}Controller('gym')(Control);UseGuards(GymDashGuard)(Control);Get('all')(Control.prototype,'read',Object.getOwnPropertyDescriptor(Control.prototype,'read'));
class TestModule{}Module({controllers:[Control],providers:[JwtStrategy,
{provide:ConfigService,useValue:new ConfigService({JWT_SECRET:'legacy-test-signing',GYMDASH_SECRET:'private-key',GYMDASH_BILLING_ADMIN_EMAILS:'platform@example.test'})},
{provide:PrismaService,useValue:{user:{findUnique:async({where})=>({id:where.id,actif:true,gymId:'blocked-gym',role:'ADMIN',email:where.id==='platform'?'platform@example.test':'owner@example.test'})}}},]})(TestModule);
const app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,'127.0.0.1');t.after(()=>app.close());const origin=await app.getUrl();const jwt=new JwtService({secret:'legacy-test-signing'});
const request=(id,secret='private-key')=>fetch(origin+'/gym/all',{headers:{'x-gymdash-secret':secret,...(id?{Authorization:'Bearer '+jwt.sign({sub:id})}:{})}});
assert.equal((await request()).status,401);assert.equal((await request('owner')).status,403);assert.equal((await request('platform','wrong')).status,401);assert.equal((await request('platform')).status,200);
});
