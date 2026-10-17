require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {ExercisesService}=require('./exercises.service.ts');
const {ExerciseCatalogService}=require('./exercise-catalog.service.ts');
const testUrl=process.env.EXERCISES_TEST_DATABASE_URL;

test('real PostgreSQL additive migration preserves active legacy records, enforces uniqueness and review publication', {skip:!testUrl}, async t=>{
 const url=new URL(testUrl);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15439');assert.equal(url.pathname,'/gympass_exercise_test');
 const db=new PrismaClient({datasources:{db:{url:testUrl}}});t.after(()=>db.$disconnect());
 // This database is a dedicated disposable fixture guarded by all three checks above.
 await db.$executeRawUnsafe('DROP TABLE IF EXISTS "gymbro_exercises"');
 await db.$executeRawUnsafe(`CREATE TABLE "gymbro_exercises" (
 "id" TEXT PRIMARY KEY,"nomFr" TEXT NOT NULL,"descriptionFr" TEXT,"instructionsFrJson" TEXT,"groupeMusculaire" TEXT NOT NULL,
 "musclesPrimairesJson" TEXT NOT NULL,"musclesSecondairesJson" TEXT,"equipementRequis" TEXT NOT NULL,"difficulte" TEXT,
 "photoExerciceUrl" TEXT,"photoMuscleUrl" TEXT,"actif" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL)`);
 await db.$executeRawUnsafe(`INSERT INTO "gymbro_exercises" ("id","nomFr","groupeMusculaire","musclesPrimairesJson","equipementRequis","updatedAt") VALUES ('legacy','Existing squat','legs','[]','none',CURRENT_TIMESTAMP)`);
 const sql=fs.readFileSync(path.resolve(__dirname,'../../../prisma/migrations/20261017120000_exercise_animation_catalog/migration.sql'),'utf8');
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
 assert.equal((await db.gymbroExercise.findUnique({where:{id:'legacy'}})).actif,true);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exercise-pg-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'flow','revision'),{recursive:true});
 for(const ext of ['gif','png']) fs.writeFileSync(path.join(dir,'flow','revision','1.'+ext),'fixture');
 fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify({version:1,source:'flow',revision:'revision',dataRevision:'data',exercises:[{sourceId:'1',nameOriginal:'Squat',instructionsFr:['Pliez les genoux'],groupeMusculaire:'legs',musclesPrimaires:['quadriceps'],musclesSecondaires:[],equipementRequis:'none',hasAnimation:true,license:'CC0-1.0'}]}));
 const catalog=new ExerciseCatalogService({get:key=>key==='EXERCISE_CATALOG_DIR'?dir:undefined});const service=new ExercisesService(db,catalog);
 const imports=await Promise.all([service.importExercise('1'),service.importExercise('1')]);assert.equal(imports[0].id,imports[1].id);
 const id=imports[0].id;assert.equal(imports[0].actif,false);assert.equal(await db.gymbroExercise.count({where:{mediaSource:'flow',mediaSourceId:'1'}}),1);
 await assert.rejects(service.findOne(id),e=>e.getStatus()===404);
 await assert.rejects(service.toggle(id),e=>e.getStatus()===400);
 await assert.rejects(service.attachSource('legacy','1'),e=>e.getStatus()===409);
 assert.equal((await db.gymbroExercise.findUnique({where:{id:'legacy'}})).actif,true);
 const published=await service.toggle(id,true,imports[0].updatedAt.toISOString());assert.equal(published.actif,true);assert.ok(published.animationReviewedAt);
 await service.attachSource(id,'1');const changed=await db.gymbroExercise.findUnique({where:{id}});assert.equal(changed.actif,false);assert.equal(changed.animationReviewedAt,null);
 assert.equal((await service.findOne('legacy')).actif,true);
});
