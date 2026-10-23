require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JwtService } = require('@nestjs/jwt');
const bcrypt = require('bcryptjs');
const { AuthService } = require('./auth.service.ts');
const { tokenDigest } = require('./password-security.ts');

async function fixture() {
  const secret = 'test-only-device-sessions-secret';
  const jwt = new JwtService({ secret });
  const user = { id:'a', nom:'Test', prenom:'Agent', email:'a@test.invalid', gymId:'gym', gym:{id:'gym',nom:'Test',slug:'test'}, actif:true, authVersion:0, passwordHash:await bcrypt.hash('test password',4), refreshTokenHash:null };
  const sessions = new Map();
  const matches = (row, where) => Object.entries(where).every(([k,v]) => v && typeof v === 'object' && !(v instanceof Date) ? ('gt' in v ? row[k] > v.gt : 'lte' in v ? row[k] <= v.lte : false) : row[k] === v);
  const db = {
    user: {
      findUnique: async()=>({...user}),
      updateMany: async({where,data})=>{if(!matches(user,where))return{count:0};Object.assign(user,data);return{count:1};},
      update:async({data})=>{for(const[k,v]of Object.entries(data))user[k]=v&&typeof v==='object'&&'increment'in v?user[k]+v.increment:v;return {...user};},
    },
    authSession: {
      create:async({data})=>{sessions.set(data.id,{...data});return data;},
      updateMany:async({where,data})=>{let count=0;for(const row of sessions.values())if(matches(row,where)){Object.assign(row,data);count++;}return{count};},
      deleteMany:async({where})=>{let count=0;for(const [id,row]of sessions)if(matches(row,where)){sessions.delete(id);count++;}return{count};},
    },
  };
  db.$transaction = fn => fn(db);
  const service = new AuthService(db,jwt,{get:(key,fallback)=>key==='JWT_SECRET'?secret:fallback},{},{});
  const login = () => service.login({email:user.email,password:'test password'});
  return {user,sessions,jwt,service,login};
}

test('Chrome login does not invalidate the phone refresh session',async()=>{
  const f=await fixture();const phone=await f.login();const chrome=await f.login();
  assert.ok((await f.service.refresh(phone.refreshToken)).accessToken);
  assert.ok((await f.service.refresh(chrome.refreshToken)).accessToken);
});
test('a rotating refresh token can be consumed only once under concurrent requests',async()=>{
  const f=await fixture();const phone=await f.login();
  const results=await Promise.allSettled([1,2].map(()=>f.service.refresh(phone.refreshToken)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('existing legacy phone token survives a new login and upgrades to a device session',async()=>{
  const f=await fixture();
  const old=await f.jwt.signAsync({sub:'a',authVersion:0,tokenType:'refresh'},{expiresIn:'30d'});
  f.user.refreshTokenHash=`sha256:${tokenDigest(old)}`;
  await f.login();
  const upgraded=await f.service.refresh(old);
  assert.equal(typeof f.jwt.decode(upgraded.refreshToken).sid,'string');
  await assert.rejects(f.service.refresh(old));
});
test('account-wide revocation still rejects every device session',async()=>{
  const f=await fixture();const a=await f.login();const b=await f.login();
  await f.service.logout('a');
  await assert.rejects(f.service.refresh(a.refreshToken));
  await assert.rejects(f.service.refresh(b.refreshToken));
});
