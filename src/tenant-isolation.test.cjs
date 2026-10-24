require('reflect-metadata');
require('ts-node/register/transpile-only');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Test} = require('@nestjs/testing');
const {ConfigModule} = require('@nestjs/config');
const {PassportModule} = require('@nestjs/passport');
const {ValidationPipe} = require('@nestjs/common');
const jwt = require('jsonwebtoken');
const {ThrottlerModule} = require('@nestjs/throttler');
const {PrismaService} = require('./prisma/prisma.service.ts');
const {JwtStrategy} = require('./auth/strategies/jwt.strategy.ts');
const {BillingAccessService} = require('./platform-billing/access.service.ts');

// Only the persistence boundary is simulated. HTTP routing, JWT verification,
// current-user lookup, role guards, DTO validation and services are real.
function fixture() {
  const rows = {
    gym: ['a','b'].map(id => ({id,nom:`Salle ${id}`,prixSeance:2000})),
    user: ['a','b'].flatMap(gymId => ['ADMIN','GERANT'].map(role => ({
      id:`${gymId}-${role}`,gymId,role,actif:true,authVersion:0,
      email:`${gymId}-${role}@test.invalid`,nom:`private-${gymId}`,prenom:role,
      passwordHash:'secret',fcmToken:null,
    }))),
    member: ['a','b'].map(gymId => ({id:`member-${gymId}`,gymId,nom:`private-${gymId}`,prenom:'Member',qrCode:`GYMPASS-SN-${gymId}`,numeroCarte:`CARD-${gymId}`,carteActive:true,subscriptions:[],sessionCards:[]})),
    payment: ['a','b'].map(gymId => ({id:`payment-${gymId}`,gymId,userId:`${gymId}-ADMIN`,memberId:`member-${gymId}`,createdAt:new Date(),montantFcfa:1000,type:'ABONNEMENT'})),
    sessionCard: ['a','b'].map(gymId => ({id:`card-${gymId}`,memberId:`member-${gymId}`,active:true})),
    bracelet: ['a','b'].map(gymId => ({id:`bracelet-${gymId}`,gymId,qrCode:`GYMPASS-BRACELET-${gymId}`,actif:true,soldAt:null})),
    notification: ['a','b'].map(gymId => ({id:`notification-${gymId}`,gymId,userId:null,lue:false,titre:`private-${gymId}`})),
    entry: [], subscription: [], braceletVente: [], braceletSale: [],
  };
  const writes=[];
  const related=(row,key)=>key==='member'?rows.member.find(m=>m.id===row.memberId):key==='user'?rows.user.find(u=>u.id===row.userId):key==='gym'?rows.gym.find(g=>g.id===row.gymId):row[key];
  const matches=(row,where={})=>Object.entries(where).every(([key,value])=>{
    if(value===undefined)return true;
    if(key==='OR')return value.some(w=>matches(row,w));
    if(key==='AND')return value.every(w=>matches(row,w));
    const actual=related(row,key);
    if(value&&typeof value==='object'&&!(value instanceof Date)) {
      return Object.entries(value).every(([op,v])=>op==='gte'?actual>=v:op==='gt'?actual>v:op==='lt'?actual<v:op==='lte'?actual<=v:op==='in'?v.includes(actual):op==='not'?actual!==v:op==='equals'?actual===v:matches(actual||{}, {[op]:v}));
    }
    return actual===value;
  });
  const expand=(row,options={})=>{
    if(!row)return null;
    const out={...row};
    for(const [key,include]of Object.entries(options.include||{})) {
      if(['payments','entries','subscriptions','sessionCards'].includes(key)) {
        const model={payments:'payment',entries:'entry',subscriptions:'subscription',sessionCards:'sessionCard'}[key];
        out[key]=rows[model].filter(r=>r.memberId===row.id&&matches(r,include.where));
      } else if(key!=='_count') out[key]=related(row,key);
    }
    if(options.select)return Object.fromEntries(Object.keys(options.select).filter(k=>options.select[k]).map(k=>[k,related(out,k)]));
    return out;
  };
  const db={};
  for(const [model,list]of Object.entries(rows))db[model]={
    findUnique:async q=>expand(list.find(r=>matches(r,q.where)),q),
    findFirst:async q=>expand(list.find(r=>matches(r,q.where)),q),
    findMany:async(q={})=>list.filter(r=>matches(r,q.where)).map(r=>expand(r,q)),
    count:async(q={})=>list.filter(r=>matches(r,q.where)).length,
    aggregate:async()=>({_sum:{montantFcfa:0},_count:0}),
    update:async({where,data})=>{const row=list.find(r=>matches(r,where));assert.ok(row);writes.push({model,id:row.id});Object.assign(row,data);return {...row};},
    updateMany:async({where,data})=>{const found=list.filter(r=>matches(r,where));for(const row of found){writes.push({model,id:row.id});Object.assign(row,data);}return{count:found.length};},
  };
  db.$transaction=work=>typeof work==='function'?work(db):Promise.all(work);
  return {db,rows,writes};
}

test('HTTP tenant matrix rejects foreign resources, forged tenant claims and privileged routes',async t=>{
  const f=fixture();
  const load=(path,name)=>require(path)[name];
  const modules=[
    ['members/members','Members'],['users/users','Users'],['payments/payments','Payments'],
    ['scanner/scanner','Scanner'],['bracelets/bracelets','Bracelets'],['entries/entries','Entries'],
    ['session-cards/session-cards','SessionCards'],['notifications/notifications','Notifications'],
  ];
  const {PaymentReceiptService}=require('./payments/payment-receipt.service.ts');
  const {MemberCardDeliveryService}=require('./members/member-card-delivery.service.ts');
  const {MemberCardDeliveryController}=require('./members/member-card-delivery.controller.ts');
  const {GymController}=require('./gym/gym.controller.ts');
  const {GymService}=require('./gym/gym.service.ts');
  const services=Object.fromEntries(modules.map(([path,name])=>[name,load(`./${path}.service.ts`,`${name}Service`)]));
  const notifications=new services.Notifications(f.db,{sendToTokens:async()=>{}});
  const bracelets=new services.Bracelets(f.db);
  const receipts=new PaymentReceiptService(f.db,{},{});
  const instances={
    Members:new services.Members(f.db,{},notifications),Users:new services.Users(f.db,{}),
    Payments:new services.Payments(f.db,notifications,receipts),Scanner:new services.Scanner(f.db,bracelets),
    Bracelets:bracelets,Entries:new services.Entries(f.db),SessionCards:new services.SessionCards(f.db),Notifications:notifications,
  };
  const config={JWT_SECRET:'local-only-tenant-test-secret',GYMDASH_SECRET:'local-platform-secret',GYMDASH_BILLING_ADMIN_EMAILS:'platform@test.invalid'};
  const module=await Test.createTestingModule({
    imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,load:[()=>config]}),PassportModule,ThrottlerModule.forRoot([{ttl:60000,limit:1000}])],
    controllers:[...modules.map(([path,name])=>load(`./${path}.controller.ts`,`${name}Controller`)),MemberCardDeliveryController,GymController],
    providers:[JwtStrategy,{provide:PrismaService,useValue:f.db},{provide:BillingAccessService,useValue:{assertAllowed:async()=>{}}},
      ...modules.map(([,name])=>({provide:services[name],useValue:instances[name]})),
      {provide:PaymentReceiptService,useValue:receipts},
      {provide:MemberCardDeliveryService,useValue:new MemberCardDeliveryService(f.db,{})},
      {provide:GymService,useValue:new GymService(f.db,{},{get:()=>''})},
    ],
  }).compile();
  const app=module.createNestApplication();
  app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  await app.listen(0,'127.0.0.1');t.after(()=>app.close());const origin=await app.getUrl();
  let requests=0;
  async function request(method,path,body,role='ADMIN') {
    requests++;
    return fetch(origin+'/api/v1'+path, {method,headers:{Authorization:'Bearer '+jwt.sign({sub:`a-${role}`,gymId:'b',role:'ADMIN'},config.JWT_SECRET),'Content-Type':'application/json','x-gymdash-secret':'local-platform-secret'},...(body?{body:JSON.stringify(body)}:{})});
  }
  for(const role of ['ADMIN','GERANT']) {
    const positive=await request('GET','/members?gymId=b',null,role);
    assert.equal(positive.status,200);const list=await positive.json();assert.deepEqual(list.map(r=>r.gymId),['a']);
    for(const [method,path,body]of [
      ['GET','/members/member-b'],['PATCH','/members/member-b',{nom:'changed'}],
      ['PATCH','/members/member-b/carte/toggle'],['POST','/members/member-b/carte/replace',{}],
      ['GET','/members/member-b/paid-months'],['GET','/members/member-b/card-whatsapp'],
      ['POST','/members/member-b/card-whatsapp',{}],['GET','/session-cards/member/member-b'],
      ['POST','/session-cards/member/member-b',{}],['PATCH','/session-cards/card-b/toggle'],
      ['GET','/scanner/lookup?qrCode=GYMPASS-SN-b'],['POST','/scanner/lookup',{qrCode:'GYMPASS-SN-b'}],
      ['POST','/scanner/scan',{qrCode:'GYMPASS-SN-b'}],
      ['POST','/scanner/exceptional',{memberId:'member-b',motif:'test'}],
      ['POST','/bracelets/lookup',{qrCode:'GYMPASS-BRACELET-b'}],
      ['GET','/payments/payment-b/receipt'],['GET','/payments/payment-b/receipt-whatsapp'],
      ['POST','/payments/payment-b/receipt-whatsapp',{}],
      ['POST','/payments',{memberId:'member-b',type:'ABONNEMENT',mode:'ESPECES',moisCouvert:'2026-10'}],
    ]) {
      const response=await request(method,path,body,role);
      assert.equal(response.status,404,`${role} ${method} ${path}: ${await response.text()}`);
    }
    for(const path of ['/members','/users','/users/gerants','/payments','/entries','/bracelets','/notifications']) {
      const response=await request('GET',`${path}?gymId=b&memberId=member-b`,null,role);
      assert.ok([200,403].includes(response.status),`${path}: ${response.status}`);
      assert.ok(!(await response.text()).includes('private-b'),path);
    }
    for(const path of ['/gym/all','/gym/b/members','/gym/b/users','/gym/b/payments','/gym/all-payments']) {
      assert.equal((await request('GET',path,null,role)).status,403,`${role} ${path}`);
    }
  }
  for(const [method,path,body]of [['GET','/users/b-GERANT'],['PATCH','/users/b-GERANT',{nom:'changed'}],['PATCH','/users/b-GERANT/toggle'],['POST','/users/b-GERANT/reset-password',{}],['PATCH','/bracelets/bracelet-b/toggle']]) {
    assert.equal((await request(method,path,body)).status,404,path);
  }
  for(const path of ['/users','/users/gerants','/users/b-GERANT'])assert.equal((await request('GET',path,null,'GERANT')).status,403,path);
  for(const [method,path,body]of [
    ['POST','/users/admin-create',{gymId:'b',nom:'Attempt',prenom:'Agent',telephone:'+221771234567'}],
    ['PATCH','/users/admin/b-GERANT',{gymId:'b',nom:'Attempt'}],
    ['POST','/users/admin/b-GERANT/reset-password',{gymId:'b'}],
  ]) assert.equal((await request(method,path,body)).status,403,path);
  const anon=await fetch(origin+'/api/v1/members');assert.equal(anon.status,401);
  const wrongContext=await fetch(origin+'/api/v1/members',{headers:{Authorization:'Bearer '+jwt.sign({sub:'a-ADMIN'},config.JWT_SECRET),'x-gympass-gym-id':'b'}});
  assert.equal(wrongContext.status,403,'A selected gym mismatch must fail instead of silently using another gym');
  assert.deepEqual(f.writes,[],'No foreign request may mutate any record');
  const self=await request('PATCH','/users/me',{nom:'Updated',gymId:'b',role:'ADMIN'},'GERANT');
  assert.equal(self.status,200);const profile=await self.json();
  assert.equal(profile.gymId,'a');assert.equal(profile.role,'GERANT');
  t.diagnostic(`${requests+2} real local HTTP requests; no production access; Prisma repository simulated`);
});

test('finances bind both union branches to the authenticated gym and force receptionist ownership/week',()=>{
  const {FinancesService}=require('./finances/finances.service.ts');
  const {FinancesQuery}=require('./finances/finances.dto.ts');
  const service=new FinancesService({});
  for(const role of ['ADMIN','GERANT']) {
    const query=Object.assign(new FinancesQuery(),{period:'all',gymId:'b',userId:'b-ADMIN'});
    const scope=service.base({id:'a-GERANT',gymId:'a',role},query);
    assert.equal(scope.cte.text.match(/WHERE [pb]\."gymId" = \$/g)?.length,2);
    assert.equal(scope.cte.values.filter(v=>v==='a').length,2);
    assert.ok(!scope.cte.values.includes('b'));
    if(role==='GERANT') {assert.equal(scope.ownWeek,true);assert.ok(scope.start);assert.ok(scope.end);assert.ok(scope.cte.values.includes('a-GERANT'));}
  }
});

module.exports={fixture};
