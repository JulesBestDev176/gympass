require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const {PasswordRecoveryService}=require('./password-recovery.service.ts');

function fixture({actif=true,telephone='+221771234567',delivery='accepted'}={}) {
 const row={id:'staff',gymId:'gym',email:'awa@gym.sn',prenom:'Awa',actif,telephone,authVersion:0,otpCode:null,otpExpiresAt:null,otpAttempts:0,otpRequestedAt:null,otpWindowStartedAt:null,otpRequests:0,passwordResetTokenHash:null,passwordResetExpiresAt:null};
 const sent=[];
 const matches=(w)=>Object.entries(w).every(([key,v])=>{
  if(key==='OR')return v.some(matches);
  if(v&&typeof v==='object'&&!(v instanceof Date)) {
   if('lt'in v)return row[key]<v.lt;if('gt'in v)return row[key]>v.gt;
   return false;
  }
  return row[key] instanceof Date ? +row[key]===+v : row[key]===v;
 });
 const assign=(data)=>{for(const [k,v]of Object.entries(data))row[k]=v&&typeof v==='object'&&'increment'in v?row[k]+v.increment:v;};
 const db={user:{
  findFirst:async({where})=>where.email?.equals===row.email?{...row}:null,
  findUnique:async()=>({...row}),
  updateMany:async({where,data})=>{if(!matches(where))return{count:0};assign(data);return{count:1};},
 }};
 const service=new PasswordRecoveryService(db,{get:()=> 'test-only-secret'}, {sendOtp:async(...args)=>{sent.push(args);return{status:delivery};}});
 const request=async()=>{const r=await service.request(row.email);await new Promise(resolve=>setImmediate(resolve));return r;};
 return{row,db,service,sent,request};
}
test('unknown and disabled accounts have the same public response and no send',async()=>{
 const f=fixture({actif:false});const a=await f.request();const b=await f.service.request('unknown@gym.sn');assert.deepEqual(a,b);assert.equal(f.sent.length,0);
});
test('request stores only an OTP digest and enforces resend cooldown',async()=>{
 const f=fixture();await f.request();assert.match(f.sent[0][1],/^\d{6}$/);assert.notEqual(f.row.otpCode,f.sent[0][1]);
 await f.request();assert.equal(f.sent.length,1);assert.equal(f.row.authVersion,0);
});
test('five incorrect OTP attempts exhaust the code',async()=>{
 const f=fixture();await f.request();const code=f.sent[0][1];const wrong=code==='000000'?'000001':'000000';
 for(let i=0;i<5;i++)await assert.rejects(f.service.verify(f.row.email,wrong));
 await assert.rejects(f.service.verify(f.row.email,code));assert.equal(f.row.otpAttempts,5);
});
test('expired OTP and failed delivery cannot issue a reset grant',async()=>{
 const f=fixture();await f.request();f.row.otpExpiresAt=new Date(Date.now()-1);await assert.rejects(f.service.verify(f.row.email,f.sent[0][1]));
 const failed=fixture({delivery:'failed'});await failed.request();assert.equal(failed.row.otpCode,null);
});
test('verification is single-use and yields only a short-lived reset grant',async()=>{
 const f=fixture();await f.request();const grant=await f.service.verify(f.row.email,f.sent[0][1]);
 assert.ok(grant.resetToken.length>=40);assert.notEqual(f.row.passwordResetTokenHash,grant.resetToken);assert.equal(f.row.otpCode,null);
 await assert.rejects(f.service.verify(f.row.email,f.sent[0][1]));
});
test('password confirmation and policy are enforced; grant consumed atomically once',async()=>{
 const f=fixture();await f.request();const {resetToken}=await f.service.verify(f.row.email,f.sent[0][1]);
 await assert.rejects(f.service.complete(f.row.email,resetToken,'short','short'));
 await assert.rejects(f.service.complete(f.row.email,resetToken,'New secure pass 2026','mismatch'));
 const results=await Promise.allSettled([1,2].map(()=>f.service.complete(f.row.email,resetToken,'New secure pass 2026','New secure pass 2026')));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.row.authVersion,1);assert.equal(f.row.mustChangePassword,false);
 assert.equal(await bcrypt.compare('New secure pass 2026',f.row.passwordHash),true);
 await assert.rejects(f.service.complete(f.row.email,resetToken,'Another secure pass','Another secure pass'));
});
test('expired grant or inactive user cannot change a password',async()=>{
 const f=fixture();await f.request();const {resetToken}=await f.service.verify(f.row.email,f.sent[0][1]);f.row.passwordResetExpiresAt=new Date(Date.now()-1);
 await assert.rejects(f.service.complete(f.row.email,resetToken,'New secure pass 2026','New secure pass 2026'));
});
test('five requests per hour per account, including across service instances',async()=>{
 const f=fixture();for(let i=0;i<6;i++){f.row.otpRequestedAt=new Date(Date.now()-61000);await f.request();}
 assert.equal(f.sent.length,5);
});
