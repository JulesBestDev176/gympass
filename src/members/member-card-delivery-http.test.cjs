require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {Module}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');const {ConfigService}=require('@nestjs/config');const {JwtService}=require('@nestjs/jwt');const {ThrottlerModule}=require('@nestjs/throttler');
const {MemberCardDeliveryController}=require('./member-card-delivery.controller.ts');const {MemberCardDeliveryService}=require('./member-card-delivery.service.ts');const {PrismaService}=require('../prisma/prisma.service.ts');const {JwtStrategy}=require('../auth/strategies/jwt.strategy.ts');const {BillingAccessService}=require('../platform-billing/access.service.ts');
test('HTTP card upload requires authenticated staff, uses their gym, and rejects oversized or extra fields',async t=>{
 const signing='isolated-card-test';let calls=0;
 class TestModule{}
 Module({imports:[ThrottlerModule.forRoot([{ttl:60000,limit:100}])],controllers:[MemberCardDeliveryController],providers:[JwtStrategy,
 {provide:ConfigService,useValue:new ConfigService({JWT_SECRET:signing})},
 {provide:PrismaService,useValue:{user:{findUnique:async()=>({id:'staff',actif:true,gymId:'own-gym',role:'GERANT',authVersion:0})}}},
 {provide:BillingAccessService,useValue:{assertAllowed:async()=>{}}},
 {provide:MemberCardDeliveryService,useValue:{send:async(gym,id,file)=>{calls++;assert.equal(gym,'own-gym');assert.equal(id,'member');assert.equal(file.mimetype,'image/png');return{status:'accepted',retryable:false};},status:async()=>({status:'not_sent',retryable:true})}},
 ]})(TestModule);
 const app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,'127.0.0.1');t.after(()=>app.close());const url=(await app.getUrl())+'/members/member/card-whatsapp';
 const token=new JwtService({secret:signing}).sign({sub:'staff',tokenType:'access',authVersion:0});
 const form=(size=16,extra=false)=>{const f=new FormData();f.append('file',new Blob([new Uint8Array(size)],{type:'image/png'}),'card.png');if(extra)f.append('gymId','another-gym');return f;};
 assert.equal((await fetch(url,{method:'POST',body:form()})).status,401);
 assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token},body:form()})).status,201);assert.equal(calls,1);
 assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token},body:form(4*1024*1024+1)})).status,413);assert.equal(calls,1);
 assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token},body:form(16,true)})).status,400);assert.equal(calls,1);
 assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+token}})).status,200);
});
