require('reflect-metadata');require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const sharp=require('sharp');const {renderPaymentReceipt}=require('./payment-receipt.pdf.ts');
const {receiptData}=require('./payment-receipt.data.ts');const {PaymentReceiptService}=require('./payment-receipt.service.ts');

test('receipt renderer supports legacy, dark and light gym identities with a bounded logo',async()=>{
 const dir=path.join(__dirname,'../../tmp/branding-verification');fs.mkdirSync(dir,{recursive:true});
 const logo=await sharp({create:{width:96,height:48,channels:4,background:'#EA580C'}}).png().toBuffer();
 const base=receiptData({id:'p-0187',createdAt:new Date('2026-10-25T10:00:00Z'),type:'RECHARGE_CARTE',montantFcfa:10000,mode:'WAVE'},
  {nom:'Dakar Fitness'},{prenom:'Moussa',nom:'Fall',numeroCarte:'GP-0187',telephone:'771234567',qrCode:'GYMPASS-TEST-QR-0187'},'Awa Ndiaye',{quantity:5,balanceBefore:2,balanceAfter:7});
 for(const [name,color]of[['default',null],['blue','#2563EB'],['light','#FFFFFF'],['dark','#111827']]){
  const data={...base,branding:color?{brandColor:color,logoUrl:null}:undefined};
  const pdf=await renderPaymentReceipt(data,null,color?logo:null);
  assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(pdf.length>10000);
  fs.writeFileSync(path.join(dir,`receipt-${name}.pdf`),pdf);
 }
});

test('receipt snapshot keeps historical identity and legacy receipts get only their own gym identity',()=>{
 const service=new PaymentReceiptService({}, {}, {});
 const old={number:'old',amount:15000,branding:{brandColor:'#123456',logoUrl:'original'}};
 const row={receiptData:old,gym:{brandColor:'#ABCDEF',logoUrl:'current'}};
 assert.deepEqual(service.data(row),old);
 delete old.branding;
 assert.deepEqual(service.data(row).branding,{brandColor:'#ABCDEF',logoUrl:'current'});
 assert.equal(service.data(row).amount,15000);
});
