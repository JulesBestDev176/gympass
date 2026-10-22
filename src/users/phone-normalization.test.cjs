require('reflect-metadata');
require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {plainToInstance}=require('class-transformer');const {validate}=require('class-validator');
const {CreateUserDto,UpdateUserDto,AdminCreateUserDto}=require('./dto/user.dto.ts');
const {CreateMemberDto,UpdateMemberDto}=require('../members/dto/member.dto.ts');
const {UsersService}=require('./users.service.ts');

for(const phone of ['771234567','77 123 45 67','77-123-45-67','(77) 123 45 67','+221771234567','+221 77 123 45 67','221771234567','00221 77 123 45 67','0771234567']){
 test(`optional prefix is normalized consistently before validation: ${phone}`,async()=>{
  for(const Dto of [CreateUserDto,AdminCreateUserDto,UpdateUserDto,CreateMemberDto,UpdateMemberDto]){
   const dto=plainToInstance(Dto,{nom:'Diop',prenom:'Awa',gymId:'gym',password:'test-only-password',telephone:phone,...(Dto===CreateMemberDto?{paiement:{mode:'ESPECES'}}:{})});
   assert.deepEqual(await validate(dto),[],Dto.name);assert.equal(dto.telephone,'+221771234567',Dto.name);
  }
 });
}
test('missing or non-string member phones fail validation without an exception',async()=>{
 for(const telephone of [undefined,null,771234567,{},'123','+33712345678']){
  assert.ok((await validate(plainToInstance(CreateMemberDto,{nom:'Diop',prenom:'Awa',telephone}))).length>0);
 }
});
test('creation persists and sends canonical phone, then detects the same number with a prefix as a duplicate',async()=>{
 const rows=[];const sent=[];
 const service=new UsersService({gym:{findUnique:async({where})=>({id:where.id,nom:where.id})},user:{
  findFirst:async({where})=>rows.find(row=>where.telephone?row.gymId===where.gymId&&row.telephone===where.telephone:row.email===where.email.equals)||null,
  create:async({data})=>{const row={...data,id:String(rows.length)};rows.push(row);return row;},
 }},{sendCredentials:async(...args)=>{sent.push(args);return{status:'accepted'};}});
 const input={nom:'Diop',prenom:'Awa',password:'test-only-password',telephone:'77 123 45 67'};
 await service.create('gym-one',input);assert.equal(rows[0].telephone,'+221771234567');assert.equal(sent[0][0],rows[0].telephone);
 await assert.rejects(service.create('gym-one',{...input,telephone:'+221771234567'}),e=>e.getStatus?.()===409);
 await service.create('gym-two',{...input,telephone:'00221771234567'});assert.equal(rows.length,2);
});
