require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {Module,ValidationPipe}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');
const {ConfigService}=require('@nestjs/config');const {JwtService}=require('@nestjs/jwt');const {PassportModule}=require('@nestjs/passport');const {ThrottlerModule}=require('@nestjs/throttler');
const {AuthController}=require('./auth.controller.ts');const {AuthService}=require('./auth.service.ts');const {JwtStrategy}=require('./strategies/jwt.strategy.ts');
const {UsersController}=require('../users/users.controller.ts');const {UsersService}=require('../users/users.service.ts');const {PrismaService}=require('../prisma/prisma.service.ts');

test('HTTP guards, DTOs, session versions and IP throttling protect recovery and admin actions',async(t)=>{
 const values={JWT_SECRET:'http-test-secret',GYMDASH_SECRET:'http-test-dashboard',GYMDASH_BILLING_ADMIN_EMAILS:'platform@gym.sn'};
 const users={platform:{id:'platform',email:'platform@gym.sn',role:'ADMIN',actif:true,authVersion:1},owner:{id:'owner',email:'owner@gym.sn',role:'ADMIN',actif:true,authVersion:1}};
 let renewals=0,contacts=0,verifies=0;
 class TestModule{};
 Module({imports:[PassportModule,ThrottlerModule.forRoot([{ttl:60000,limit:100}])],controllers:[AuthController,UsersController],providers:[JwtStrategy,
  {provide:ConfigService,useValue:new ConfigService(values)},
  {provide:PrismaService,useValue:{user:{findUnique:async({where})=>users[where.id]}}},
  {provide:UsersService,useValue:{renewPassword:async()=>{renewals++;return{whatsapp:{status:'accepted'}};},update:async()=>{contacts++;return{};}}},
  {provide:AuthService,useValue:{forgotPassword:async()=>({message:'generic'}),verifyResetOtp:async()=>{verifies++;return{resetToken:'a'.repeat(43)};},resetPassword:async()=>({})}},
 ]})(TestModule);
 const app=await NestFactory.create(TestModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');t.after(()=>app.close());
 const origin=await app.getUrl();const jwt=new JwtService({secret:values.JWT_SECRET});
 const token=(sub,authVersion=1,tokenType='access')=>jwt.sign({sub,authVersion,tokenType});
 const send=(path,body,access,secret,method='POST')=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(access?{Authorization:`Bearer ${access}`}:{ }),...(secret?{'x-gymdash-secret':secret}:{})},body:JSON.stringify(body)});
 const path='/users/admin/staff/reset-password';
 assert.equal((await send(path,{gymId:'gym'})).status,401);
 assert.equal((await send(path,{gymId:'gym'},token('owner'),values.GYMDASH_SECRET)).status,403);
 assert.equal((await send(path,{gymId:'gym'},token('platform',0),values.GYMDASH_SECRET)).status,401);
 assert.equal((await send(path,{gymId:'gym'},token('platform',1,'refresh'),values.GYMDASH_SECRET)).status,401);
 assert.equal((await send(path,{gymId:'gym'},token('platform'),'wrong')).status,401);
 assert.equal((await send(path,{gymId:'gym'},token('platform'),values.GYMDASH_SECRET)).status,201);assert.equal(renewals,1);
 assert.equal((await send('/users/me',{telephone:'771234567'},token('owner'),null,'PATCH')).status,403);assert.equal(contacts,0);
 assert.equal((await send('/users/admin/staff/contact',{gymId:'gym',telephone:'771234567'},token('platform'),values.GYMDASH_SECRET,'PATCH')).status,200);assert.equal(contacts,1);
 assert.equal((await send('/auth/verify-reset-otp',{email:'awa@gym.sn',otp:'abcdef'})).status,400);assert.equal(verifies,0);
 assert.equal((await send('/auth/verify-reset-otp',{email:'awa@gym.sn',otp:'123456'})).status,201);
 assert.equal((await send('/auth/reset-password',{email:'awa@gym.sn',otp:'123456',newPassword:'New secure pass'})).status,400);
 for(let i=0;i<10;i++)assert.equal((await send('/auth/forgot-password',{email:'unknown@gym.sn'})).status,201);
 assert.equal((await send('/auth/forgot-password',{email:'unknown@gym.sn'})).status,429);
});
