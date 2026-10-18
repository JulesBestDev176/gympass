require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const {GymbroAuthService}=require('./gymbro-auth.service.ts');

function fixture(jwt={}){
 let row={id:'test-user',telephone:'+221770000000',prenom:'Test',actif:true,phoneVerified:true,
   passwordHash:'old-hash',refreshTokenHash:'old-session',otpCode:null,otpExpiresAt:null};
 const sent=[];
 const match=(where)=>Object.entries(where).every(([key,value])=>
   value&&typeof value==='object'&&'gt' in value ? row[key]>value.gt :
   value instanceof Date ? row[key]?.getTime()===value.getTime() : row[key]===value);
 const prisma={gymbroUser:{
   findUnique:async({where})=>match(where)?{...row}:null,
   update:async({where,data})=>{assert.ok(match(where));row={...row,...data};return {...row};},
   updateMany:async({where,data})=>{if(!match(where))return {count:0};row={...row,...data};return {count:1};},
 }};
 const service=new GymbroAuthService(prisma,jwt, {get:()=> 'test-only-secret'},
   {sendGymbroPasswordResetOtp:async(phone,code)=>{sent.push({phone,code});return {status:'accepted'};}});
 return {service,sent,get row(){return row;},patch:data=>row={...row,...data}};
}

test('reset request does not reveal accounts, hashes codes, and applies cooldown',async()=>{
 const f=fixture();
 const known=await f.service.requestPasswordReset({telephone:f.row.telephone});
 const unknown=await f.service.requestPasswordReset({telephone:'+221780000000'});
 assert.deepEqual(known,unknown);assert.equal(f.sent.length,1);
 assert.match(f.sent[0].code,/^\d{6}$/);assert.match(f.row.otpCode,/^reset:0:[a-f0-9]{64}$/);
 assert.notEqual(f.row.otpCode,f.sent[0].code);
 await f.service.requestPasswordReset({telephone:f.row.telephone});assert.equal(f.sent.length,1);
});

for (const operation of ['refresh','login']) {
 test(`reset prevents an in-flight ${operation} from restoring a session`,async()=>{
  let release,started;
  const pending=new Promise(resolve=>release=resolve);
  const signing=new Promise(resolve=>started=resolve);
  const f=fixture({
   verifyAsync:async()=>({sub:'test-user',app:'gymbro',tokenType:'refresh'}),
   signAsync:async()=>{started();await pending;return 'new-token';},
  });
  f.patch({passwordHash:await bcrypt.hash('old-password',4),refreshTokenHash:await bcrypt.hash('old-token',4)});
  await f.service.requestPasswordReset({telephone:f.row.telephone});
  const attempt=operation==='refresh'?f.service.refresh('old-token'):
    f.service.login({telephone:f.row.telephone,password:'old-password'});
  await signing;
  await f.service.resetPassword({telephone:f.row.telephone,otpCode:f.sent[0].code,password:'new-password'});
  release();
  await assert.rejects(attempt,error=>error?.getStatus?.()===401);
  assert.equal(f.row.refreshTokenHash,null);
 });
}

test('correct reset is single-use and revokes refresh credentials',async()=>{
 const f=fixture();await f.service.requestPasswordReset({telephone:f.row.telephone});
 const input={telephone:f.row.telephone,otpCode:f.sent[0].code,password:'new-password'};
 await f.service.resetPassword(input);
 assert.equal(await bcrypt.compare(input.password,f.row.passwordHash),true);
 assert.equal(f.row.refreshTokenHash,null);assert.equal(f.row.otpCode,null);
 await assert.rejects(f.service.resetPassword(input));
});

test('incorrect attempts are limited and registration codes cannot reset passwords',async()=>{
 const f=fixture();await f.service.requestPasswordReset({telephone:f.row.telephone});
 const wrong=f.sent[0].code==='000000'?'000001':'000000';
 for(let i=0;i<5;i++)await assert.rejects(f.service.resetPassword({telephone:f.row.telephone,otpCode:wrong,password:'new-password'}));
 await assert.rejects(f.service.resetPassword({telephone:f.row.telephone,otpCode:f.sent[0].code,password:'new-password'}));
 assert.equal(f.row.passwordHash,'old-hash');
 f.patch({otpCode:'123456',otpExpiresAt:new Date(Date.now()+60000)});
 await assert.rejects(f.service.resetPassword({telephone:f.row.telephone,otpCode:'123456',password:'new-password'}));
});

test('expired reset and inactive accounts cannot change passwords',async()=>{
 const f=fixture();await f.service.requestPasswordReset({telephone:f.row.telephone});
 f.patch({otpExpiresAt:new Date(Date.now()-1)});
 await assert.rejects(f.service.resetPassword({telephone:f.row.telephone,otpCode:f.sent[0].code,password:'new-password'}));
 f.patch({actif:false,otpCode:null,otpExpiresAt:null});
 await f.service.requestPasswordReset({telephone:f.row.telephone});assert.equal(f.sent.length,1);
});

test('concurrent confirmation consumes the reset only once',async()=>{
 const f=fixture();await f.service.requestPasswordReset({telephone:f.row.telephone});
 const input={telephone:f.row.telephone,otpCode:f.sent[0].code,password:'new-password'};
 const results=await Promise.allSettled([f.service.resetPassword(input),f.service.resetPassword(input)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});

test('concurrent wrong attempts cannot exceed the five-attempt budget',async()=>{
 const f=fixture();await f.service.requestPasswordReset({telephone:f.row.telephone});
 const wrong={telephone:f.row.telephone,otpCode:'000000',password:'new-password'};
 for(let round=0;round<5;round++)await Promise.allSettled(Array.from({length:8},()=>f.service.resetPassword(wrong)));
 await assert.rejects(f.service.resetPassword({...wrong,otpCode:f.sent[0].code}));
 assert.equal(f.row.passwordHash,'old-hash');
});
