require('reflect-metadata');
require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('class-validator');
const {GymBrandingService,UpdateBrandingDto}=require('./gym-branding.service.ts');
const {receiptData}=require('../payments/payment-receipt.data.ts');
const sharp=require('sharp');
const {UploadService}=require('../upload/upload.service.ts');
const {ConfigService}=require('@nestjs/config');

test('branding only writes the authenticated gym and never accepts a foreign logo URL',async()=>{
  const rows={a:{id:'a',nom:'A',logoUrl:null,brandColor:null},b:{id:'b',nom:'B',logoUrl:null,brandColor:'#FFFFFF'}};
  const service=new GymBrandingService({gym:{findUnique:async({where})=>rows[where.id],update:async({where,data})=>Object.assign(rows[where.id],data)}},{uploadGymLogo:async(id)=>({url:`https://storage/gym-logos/${id}/logo.png`})});
  const dto=Object.assign(new UpdateBrandingDto(),{brandColor:'#1245ab'});
  assert.equal((await validate(dto)).length,0);
  await service.update('a',dto);
  assert.equal(rows.a.brandColor,'#1245AB'); assert.equal(rows.b.brandColor,'#FFFFFF');
  await service.logo('a',Buffer.from('test'));
  assert.match(rows.a.logoUrl,/\/a\/logo.png$/);assert.equal(rows.b.logoUrl,null);
  await service.update('a',{removeLogo:true,brandColor:null});
  assert.equal(rows.a.logoUrl,null);assert.equal(rows.a.brandColor,null);
  const invalid=Object.assign(new UpdateBrandingDto(),{brandColor:'red'});
  assert.ok((await validate(invalid)).length>0);
  const foreign=Object.assign(new UpdateBrandingDto(),{logoUrl:'https://evil.invalid/logo.png'});
  assert.ok((await validate(foreign,{whitelist:true,forbidNonWhitelisted:true})).length>0);
});

test('logo is decoded, bounded, re-encoded as PNG and stored under the gym namespace',async()=>{
  const upload=new UploadService(new ConfigService({MINIO_ENDPOINT:'localhost'}));
  let stored;
  upload.client.bucketExists=async()=>true;
  upload.client.putObject=async(bucket,key,data)=>{stored={key,data};};
  const input=await sharp({create:{width:1000,height:500,channels:4,background:'#345678'}}).webp().toBuffer();
  const result=await upload.uploadGymLogo('gym-a',input);
  assert.match(stored.key,/^gym-logos\/gym-a\/[a-f0-9-]+\.png$/);
  assert.ok(result.url.endsWith(stored.key));
  const meta=await sharp(stored.data).metadata();assert.equal(meta.format,'png');assert.ok(meta.width<=512);assert.equal(meta.width/meta.height,2);
  await assert.rejects(upload.uploadGymLogo('gym-a',Buffer.from('<svg/>')),e=>e.getStatus()===400);
  assert.equal(await upload.readGymLogo('gym-b',result.url),null);
  assert.equal(await upload.readGymLogo('gym-a','http://127.0.0.1/private'),null);
});

test('new payment receipt snapshots capture gym branding without changing money or QR',()=>{
  const data=receiptData({id:'p',type:'RECHARGE_CARTE',montantFcfa:5000,mode:'WAVE',createdAt:new Date()},
    {nom:'Salle A',logoUrl:'https://storage/logo.png',brandColor:'#0055AA'},
    {prenom:'Moussa',nom:'Fall',numeroCarte:'GP-1',qrCode:'protected-qr'},'Agent');
  assert.deepEqual(data.branding,{logoUrl:'https://storage/logo.png',brandColor:'#0055AA'});
  assert.equal(data.amount,5000);assert.equal(data.member.qrCode,'protected-qr');
});
