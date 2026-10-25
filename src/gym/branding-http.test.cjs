require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {Module,ValidationPipe}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');const {ConfigService}=require('@nestjs/config');const {JwtService}=require('@nestjs/jwt');const {ThrottlerModule}=require('@nestjs/throttler');
const {GymBrandingController}=require('./gym-branding.controller.ts');const {GymBrandingService}=require('./gym-branding.service.ts');const {PrismaService}=require('../prisma/prisma.service.ts');const {JwtStrategy}=require('../auth/strategies/jwt.strategy.ts');const {BillingAccessService}=require('../platform-billing/access.service.ts');

test('HTTP branding: admin writes own gym, reception only reads; gym IDs and URLs cannot be injected',async t=>{
 const signing='branding-http-test';const calls=[];
 const users={admin:{id:'admin',actif:true,gymId:'a',role:'ADMIN'},other:{id:'other',actif:true,gymId:'b',role:'ADMIN'},reception:{id:'reception',actif:true,gymId:'a',role:'GERANT'}};
 class TestModule{}
 Module({imports:[ThrottlerModule.forRoot([{ttl:60000,limit:100}])],controllers:[GymBrandingController],providers:[JwtStrategy,
 {provide:ConfigService,useValue:new ConfigService({JWT_SECRET:signing})},
 {provide:PrismaService,useValue:{user:{findUnique:async({where})=>users[where.id]}}},
 {provide:BillingAccessService,useValue:{assertAllowed:async()=>{}}},
 {provide:GymBrandingService,useValue:{get:async gym=>({id:gym}),update:async(gym,dto)=>{calls.push(gym);return{id:gym,...dto};},logo:async(gym)=>{calls.push(gym);return{id:gym};}}},
 ]})(TestModule);
 const app=await NestFactory.create(TestModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');t.after(()=>app.close());const url=(await app.getUrl())+'/gym/branding';
 const jwt=new JwtService({secret:signing});
 const headers=id=>({Authorization:'Bearer '+jwt.sign({sub:id,tokenType:'access'}),'Content-Type':'application/json'});
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url,{headers:headers('reception')})).status,200);
 assert.equal((await fetch(url,{method:'PATCH',headers:headers('reception'),body:JSON.stringify({brandColor:'#123456'})})).status,403);
 for(const actor of ['admin','other']){
  const r=await fetch(url,{method:'PATCH',headers:headers(actor),body:JSON.stringify({brandColor:'#123456'})});assert.equal(r.status,200);assert.equal((await r.json()).id,users[actor].gymId);
 }
 for(const body of [{brandColor:'red'},{gymId:'b',brandColor:'#123456'},{logoUrl:'https://evil.invalid/x.png'}])assert.equal((await fetch(url,{method:'PATCH',headers:headers('admin'),body:JSON.stringify(body)})).status,400);
 const form=()=>{const f=new FormData();f.append('file',new Blob([new Uint8Array(16)],{type:'image/png'}),'logo.png');return f;};
 assert.equal((await fetch(url+'/logo',{method:'POST',headers:{Authorization:headers('reception').Authorization},body:form()})).status,403);
 assert.equal((await fetch(url+'/logo',{method:'POST',headers:{Authorization:headers('admin').Authorization},body:form()})).status,201);
 const extra=form();extra.append('gymId','b');assert.equal((await fetch(url+'/logo',{method:'POST',headers:{Authorization:headers('admin').Authorization},body:extra})).status,400);
 assert.deepEqual(calls,['a','b','a']);
});
