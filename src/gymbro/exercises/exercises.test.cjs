require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ExercisesService}=require('./exercises.service.ts');
test('manual creation always starts as draft even when actif is requested',async()=>{
 let stored; const service=new ExercisesService({gymbroExercise:{create:async({data})=>(stored=data)}});
 const result=await service.create({nomFr:'Squat',groupeMusculaire:'jambes',musclesPrimairesJson:'["quadriceps"]',equipementRequis:'aucun',actif:true});
 assert.equal(result.actif,false);
});
test('user detail rejects an existing draft',async()=>{
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>({id:'draft',actif:false})}});
 await assert.rejects(service.findOne('draft'),error=>error.getStatus()===404);
});
test('editing rejects malformed JSON and non-string muscle elements',async()=>{
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>({id:'a',actif:false}),update:async({data})=>data}});
 for(const value of ['{','{}','[1]']) await assert.rejects(service.update('a',{musclesPrimairesJson:value}),e=>e.getStatus()===400);
});

test('import is idempotent and concurrent unique violations return the winning draft',async()=>{
 const item={nameOriginal:'Squat',sourceId:'1',sourceRevision:'revision',instructionsFr:['Pliez les genoux'],groupeMusculaire:'jambes',musclesPrimaires:['quadriceps'],musclesSecondaires:[],equipementRequis:'aucun'};
 let stored=null;let creates=0;
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>stored,create:async({data})=>{creates++;stored={id:'first',...data};return stored;}}},{requireItem:()=>item,lookup:()=>null});
 const first=await service.importExercise('1');const second=await service.importExercise('1');
 assert.equal(first.id,second.id);assert.equal(creates,1);assert.equal(first.actif,false);
 stored=null;
 service.prisma.gymbroExercise.create=async({data})=>{stored={id:'winner',...data};throw {code:'P2002'};};
 assert.equal((await service.importExercise('1')).id,'winner');
});

test('activation requires explicit review plus available media and attaching resets review',async()=>{
 let row={id:'existing',actif:false,mediaSource:'flow',mediaSourceId:'1',mediaSourceRevision:'rev'};
 let available=false;
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>row,update:async({data})=>(row={...row,...data})}},{lookup:()=>available?{animationUrl:'/demo.gif',hasAnimation:true,license:'CC0-1.0'}:null,requireItem:()=>({sourceRevision:'rev'})});
 await assert.rejects(service.toggle('existing',true),e=>e.getStatus()===400);
 available=true;await assert.rejects(service.toggle('existing'),e=>e.getStatus()===400);
 assert.equal((await service.toggle('existing',true)).actif,true);
 assert.ok(row.animationReviewedAt instanceof Date);
 await service.attachSource('existing','1');assert.equal(row.actif,false);assert.equal(row.animationReviewedAt,null);
});

test('catalog filters and media resolve only pinned indexed pairs',()=>{
 const {ExerciseCatalogService}=require('./exercise-catalog.service.ts');
 const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exercise-catalog-'));
 try {
  fs.mkdirSync(path.join(dir,'flow','revision'),{recursive:true});
  fs.writeFileSync(path.join(dir,'flow','revision','1.gif'),'GIF89a');fs.writeFileSync(path.join(dir,'flow','revision','1.png'),'poster');
  const base={instructionsFr:['Étape'],groupeMusculaire:'jambes',musclesPrimaires:['quadriceps'],musclesSecondaires:[],equipementRequis:'aucun',license:'CC0-1.0'};
  fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify({version:1,source:'flow',revision:'revision',dataRevision:'data',exercises:[{...base,sourceId:'1',nameOriginal:'Squat',hasAnimation:true},{...base,sourceId:'2',nameOriginal:'Missing',hasAnimation:false}]}));
  const catalog=new ExerciseCatalogService({get:key=>key==='EXERCISE_CATALOG_DIR'?dir:key==='PUBLIC_API_URL'?'https://api.example.test/api/v1':undefined});
  const result=catalog.browse({q:'squat',hasAnimation:'true'});
  assert.equal(result.total,1);assert.equal(result.items[0].animationUrl,'https://api.example.test/api/v1/gymbro/exercises/media/flow/revision/1.gif');
  assert.equal(result.stats.withoutAnimation,1);
  assert.ok(catalog.media('revision','1.gif').path.endsWith('1.gif'));
  for(const [rev,file] of [['other','1.gif'],['revision','../catalog.json'],['revision','2.gif'],['revision','1.svg']]) assert.throws(()=>catalog.media(rev,file),e=>e.getStatus()===404);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('HTTP admin requires JWT, server secret and allowlisted platform ADMIN; media is public',async t=>{
 const {Module,ValidationPipe}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');
 const {ConfigService}=require('@nestjs/config');const {JwtService}=require('@nestjs/jwt');
 const {ExercisesController}=require('./exercises.controller.ts');
 const {JwtStrategy}=require('../../auth/strategies/jwt.strategy.ts');const {PrismaService}=require('../../prisma/prisma.service.ts');
 const {ExerciseCatalogService}=require('./exercise-catalog.service.ts');
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exercise-http-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'flow','revision'),{recursive:true});fs.writeFileSync(path.join(dir,'flow','revision','1.gif'),'GIF89a');fs.writeFileSync(path.join(dir,'flow','revision','1.png'),'PNG');
 fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify({version:1,source:'flow',revision:'revision',dataRevision:'data',exercises:[{sourceId:'1',nameOriginal:'Squat',instructionsFr:[],groupeMusculaire:'legs',musclesPrimaires:[],musclesSecondaires:[],equipementRequis:'none',hasAnimation:true,license:'CC0-1.0'}]}));
 const config=new ConfigService({JWT_SECRET:'test-signing-only',GYMDASH_SECRET:'private-key',GYMDASH_BILLING_ADMIN_EMAILS:'platform@example.test',EXERCISE_CATALOG_DIR:dir});
 const prisma={user:{findUnique:async({where})=>({id:where.id,actif:true,gymId:'gym',role:where.id==='manager'?'GERANT':'ADMIN',email:where.id==='platform'?'platform@example.test':'owner@example.test'})}};
 class TestModule{};Module({controllers:[ExercisesController],providers:[JwtStrategy,ExerciseCatalogService,{provide:ConfigService,useValue:config},{provide:PrismaService,useValue:prisma},{provide:ExercisesService,useValue:{findAll:async()=>[],importExercise:async(id)=>({id,actif:false})}}]})(TestModule);
 const app=await NestFactory.create(TestModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');t.after(()=>app.close());
 const origin=await app.getUrl(),jwt=new JwtService({secret:'test-signing-only'});
 const request=(suffix,id,secret='private-key',body)=>fetch(origin+'/gymbro/exercises/'+suffix,{method:body?'POST':'GET',headers:{...(id?{Authorization:'Bearer '+jwt.sign({sub:id})}:{}),'x-gymdash-secret':secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('admin/all')).status,401);
 assert.equal((await request('admin/all','owner')).status,403);
 assert.equal((await request('admin/all','manager')).status,403);
 assert.equal((await request('admin/all','platform','wrong')).status,401);
 assert.equal((await request('admin/all','platform')).status,200);
 assert.equal((await request('admin/import','platform','private-key',{sourceId:123})).status,400);
 const media=await request('media/flow/revision/1.gif');assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/gif');assert.equal(media.headers.get('x-content-type-options'),'nosniff');assert.match(media.headers.get('cache-control'),/immutable/);assert.equal(await media.text(),'GIF89a');
 assert.equal((await request('media/flow/revision/1.svg')).status,404);
});

test('missing local bundle has actionable 503 while legacy published exercises remain readable',async()=>{
 const {ExerciseCatalogService}=require('./exercise-catalog.service.ts');
 const catalog=new ExerciseCatalogService({get:key=>key==='EXERCISE_CATALOG_DIR'?'./no-such-catalog-fixture':undefined});
 assert.throws(()=>catalog.browse({}),e=>e.getStatus()===503&&/catalogue/i.test(e.message));
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>({id:'legacy',actif:true})}},catalog);
 const legacy=await service.findOne('legacy');assert.equal(legacy.actif,true);assert.equal(legacy.animationUrl,null);
});

test('attaching an already-bound source reports conflict instead of duplicating',async()=>{
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>({id:'a',actif:true}),update:async()=>{throw {code:'P2002'};}}},{requireItem:()=>({sourceRevision:'rev'})});
 await assert.rejects(service.attachSource('a','1'),e=>e.getStatus()===409);
});

test('publication refuses a stale review when exercise changed during request',async()=>{
 const original={id:'a',actif:false,updatedAt:new Date('2026-10-17T00:00:00Z'),mediaSource:'flow',mediaSourceId:'1',mediaSourceRevision:'rev'};
 const service=new ExercisesService({gymbroExercise:{findUnique:async()=>original,update:async({where,data})=>{
   // Simulate an edit committed after findUnique but before activation.
   if(where.updatedAt) throw {code:'P2025'};
   return {...original,...data};
 }}},{lookup:()=>({animationUrl:'/1.gif',hasAnimation:true,license:'CC0-1.0'})});
 await assert.rejects(service.toggle('a',true),e=>e.getStatus()===409);
});
