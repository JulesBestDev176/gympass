require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {plainToInstance}=require('class-transformer');
const {validate}=require('class-validator');
const {UsersService}=require('./users.service.ts');
const {CreateUserDto,AdminCreateUserDto}=require('./dto/user.dto.ts');
const {UsersController}=require('./users.controller.ts');

function fixture({emails=[],race=false,failure=null,delivery={status:'accepted'},gym={id:'gym-1',nom:'Élite Fitness',slug:'elite-fitness'}}={}) {
 const rows=new Map(emails.map(email=>[email,{id:email,email}]));
 const sent=[];let raced=false;const attempts=[];
 const prisma={gym:{findUnique:async()=>gym},user:{
  findUnique:async({where})=>rows.get(where.email)||null,
  findFirst:async({where})=>[...rows.values()].find(row=>where.telephone ? row.gymId===where.gymId&&row.telephone===where.telephone : row.email.toLowerCase()===where.email.equals.toLowerCase())||null,
  create:async({data})=>{
   attempts.push(data.email);
   if(failure) throw failure;
   if(race&&!raced){raced=true;rows.set(data.email,{email:data.email});throw {code:'P2002',meta:{target:['email']}};}
   if(rows.has(data.email)) throw {code:'P2002',meta:{target:['email']}};
   const row={id:`user-${rows.size}`,actif:true,...data};rows.set(data.email,row);return row;
  },
 }};
 return {service:new UsersService(prisma,{sendCredentials:async(...args)=>{sent.push(args);return delivery;}}),rows,sent,attempts};
}
const input={prenom:'Moussa',nom:'Diop',password:'TemporaryTest123!',telephone:'+221770000000',role:'GERANT'};
test('creation DTO accepts a user without any email field',async()=>{
 assert.deepEqual(await validate(plainToInstance(CreateUserDto,input)),[]);
});

test('creation requires a valid Senegal phone so credentials can be sent',async()=>{
 for(const telephone of [undefined,'','123']) {
  assert.ok((await validate(plainToInstance(CreateUserDto,{...input,telephone}))).length>0);
 }
});

test('GymDash creation route uses a concrete DTO with required phone and gym',async()=>{
 assert.equal(Reflect.getMetadata('design:paramtypes',UsersController.prototype,'adminCreate')[0],AdminCreateUserDto);
 assert.ok((await validate(plainToInstance(AdminCreateUserDto,{...input,gymId:''}))).length>0);
 assert.ok((await validate(plainToInstance(AdminCreateUserDto,{...input,gymId:'gym',telephone:undefined}))).length>0);
});

test('Relayio failure is returned without deleting or duplicating the new account',async()=>{
 const f=fixture({delivery:{status:'disconnected'}});
 const user=await f.service.create('gym-1',input);
 assert.equal(user.whatsapp.status,'disconnected');assert.equal(f.rows.size,1);assert.equal(f.sent.length,1);
 assert.equal(user.passwordHash,undefined);
});
test('creates the email from names and the actual gym, and sends the saved identifier',async()=>{
 const f=fixture();const user=await f.service.create('gym-1',input);
 assert.equal(user.email,'moussa.diop@elite-fitness.sn');
 assert.equal(user.passwordHash,undefined);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0][1],user.email);
});
test('normalizes accents, spaces, apostrophes and ligatures',async()=>{
 const f=fixture({gym:{id:'g',nom:'Élite Fitness',slug:'internal-slug'}});
 const user=await f.service.create('g',{...input,prenom:'  Él Hadji  ',nom:'N’Dœye'});
 assert.equal(user.email,'elhadji.ndoeye@elite-fitness.sn');
});
test('uses numeric suffixes until the email is globally available',async()=>{
 const f=fixture({emails:['moussa.diop@elite-fitness.sn','moussa.diop1@elite-fitness.sn']});
 assert.equal((await f.service.create('gym-1',input)).email,'moussa.diop2@elite-fitness.sn');
});
test('uses the actual gym name rather than an unrelated technical slug',async()=>{
 const f=fixture({gym:{id:'g',nom:'Gym Dakar Plateau',slug:'gdp-production'}});
 assert.equal((await f.service.create('g',input)).email,'moussa.diop@gym-dakar-plateau.sn');
});
test('existing addresses are reserved regardless of letter case',async()=>{
 const f=fixture({emails:['Moussa.Diop@Elite-Fitness.sn']});
 assert.equal((await f.service.create('gym-1',input)).email,'moussa.diop1@elite-fitness.sn');
});
test('handles a database uniqueness collision between lookup and insertion',async()=>{
 const f=fixture({race:true});
 const user=await f.service.create('gym-1',input);
 assert.equal(user.email,'moussa.diop1@elite-fitness.sn');
 assert.equal(f.sent.length,1);assert.equal(f.sent[0][1],user.email);
});
test('parallel identical registrations receive different addresses',async()=>{
 const f=fixture();const users=await Promise.all([f.service.create('gym-1',input),f.service.create('gym-1',input)]);
 assert.equal(new Set(users.map(user=>user.email)).size,2);assert.equal(f.sent.length,2);
});
test('ignores legacy client-supplied email and generates the gym address',async()=>{
 const f=fixture();const user=await f.service.create('gym-1',{...input,email:'legacy@example.com'});
 assert.equal(user.email,'moussa.diop@elite-fitness.sn');
});
test('does not mask unrelated database errors or send credentials on failure',async()=>{
 const error={code:'P2002',meta:{target:['id']}};const f=fixture({failure:error});
 await assert.rejects(f.service.create('gym-1',input),e=>e===error);assert.equal(f.sent.length,0);
});
test('does not create an account for a missing gym',async()=>{
 const f=fixture({gym:null});await assert.rejects(f.service.create('missing',input),e=>e.getStatus?.()===404);
 assert.equal(f.rows.size,0);assert.equal(f.sent.length,0);
});
test('caps long identifiers at the email local-part and domain limits',async()=>{
 const f=fixture({gym:{id:'g',slug:'a'.repeat(100)}});
 const user=await f.service.create('g',{...input,prenom:'b'.repeat(100),nom:'c'.repeat(100)});
 const [local,domain]=user.email.split('@');assert.ok(local.length<=64);assert.ok(domain.split('.')[0].length<=63);
});
