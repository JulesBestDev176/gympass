require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');const bcrypt=require('bcryptjs');
const {UsersService}=require('./users.service.ts');
function fixture(){
 const row={id:'staff',gymId:'gym',actif:true,nom:'Diop',prenom:'Awa',email:'awa@gym.sn',telephone:'+221771234567',authVersion:0,passwordRenewedAt:null,otpCode:'private',refreshTokenHash:'private',passwordHash:'private',passwordResetTokenHash:'private'};
 const sent=[];let collision=false;
 const db={user:{
  findFirst:async({where})=>where.telephone?(collision?{id:'other'}:null):where.id===row.id&&where.gymId===row.gymId?{...row}:null,
  update:async({data})=>{Object.assign(row,data);return{...row};},
  updateMany:async({where,data})=>{if(where.authVersion!==row.authVersion)return{count:0};for(const[k,v]of Object.entries(data))row[k]=v&&typeof v==='object'&&'increment'in v?row[k]+v.increment:v;return{count:1};},
 }};
 const service=new UsersService(db,{sendCredentials:async(...args)=>{sent.push(args);return{status:'accepted'};}});
 return {service,row,sent,collide:()=>{collision=true;}};
}
test('admin renewal generates and sends a secret password, revokes sessions, returns no secrets',async()=>{
 const f=fixture();const r=await f.service.renewPassword('gym','staff');
 assert.equal(f.sent.length,1);assert.equal(f.sent[0][1],f.row.email);assert.ok(f.sent[0][2].length>=24);
 assert.equal(await bcrypt.compare(f.sent[0][2],f.row.passwordHash),true);
 assert.equal(f.row.authVersion,1);assert.equal(f.row.mustChangePassword,true);assert.equal(f.row.otpCode,null);assert.equal(f.row.refreshTokenHash,null);
 assert.equal(r.whatsapp.status,'accepted');assert.ok(!JSON.stringify(r).includes(f.sent[0][2]));
 for(const key of ['passwordHash','otpCode','refreshTokenHash','passwordResetTokenHash','authVersion'])assert.equal(r.user[key],undefined);
 await assert.rejects(f.service.renewPassword('gym','staff'));assert.equal(f.sent.length,1);
});
test('admin cannot renew a foreign, inactive or phone-less account',async()=>{
 const f=fixture();await assert.rejects(f.service.renewPassword('other','staff'));f.row.actif=false;await assert.rejects(f.service.renewPassword('gym','staff'));
 f.row.actif=true;f.row.telephone=null;await assert.rejects(f.service.renewPassword('gym','staff'));assert.equal(f.sent.length,0);
});
test('phone updates normalize and reject another staff phone in the same gym',async()=>{
 const f=fixture();await f.service.update('gym','staff',{telephone:'77 765 43 21'});assert.equal(f.row.telephone,'+221777654321');assert.equal(f.row.otpCode,null);
 f.collide();await assert.rejects(f.service.update('gym','staff',{telephone:'771234567'}),e=>e.getStatus?.()===409);
 await assert.rejects(f.service.update('gym','staff',{telephone:null}));
});
