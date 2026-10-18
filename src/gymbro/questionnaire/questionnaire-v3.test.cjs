require('ts-node/register/transpile-only');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {QuestionnaireService}=require('./questionnaire.service.ts');

const steps={
  1:{primaryGoal:'PERTE_GRAISSE',priorityMuscles:[]},
  2:{ageYears:27,sexForTraining:'NON_RENSEIGNE',heightCm:null,weightKg:null,targetWeightKg:null},
  3:{experienceDuration:'JAMAIS',recentConsistency:'NEVER',trainingBreak:'PAS_ARRET',techniqueConfidence:'DISCOVERING',trainingLevel:'ADVANCED',otherSports:['Football'],sportSchedules:[{sport:'Football',sessionsPerWeek:2,days:[3,6]}]},
  4:{consentGiven:true,hasMedicalExerciseRestriction:false,hasRelevantMedicalCondition:false,hasCurrentPainOrInjury:false,hasExertionalWarningSymptoms:false,safetyStatus:'CLEAREDFORSTANDARDONBOARDING',declaredConditions:[],bodyLimitations:[]},
  5:{trainingLocations:['SALLE'],primaryTrainingLocation:'SALLE',availableEquipment:['MACHINES'],equipmentStations:['LEG_PRESS'],equipmentKnowledge:'PARTIAL'},
  6:{sessionsPerWeek:4,sessionDurationMinutes:60,preferredDays:[1,2,4,6],preferredTime:'SOIR',scheduleFlexibility:'FIXED'},
  7:{sleepCategory:'CINQSEPTH',currentlyFasting:false,supplements:[]},
  8:{preferredExercises:[],avoidedExercises:[],programVariety:'VARIE',performances:[],notes:null},
};
function fixture(){
  let row={id:'profile',userId:'user',etapeActuelle:1,questionnaireComplet:false,matchingStatus:'PENDING',matchingProgramId:null,questionnaireV3:null,updatedAt:new Date(0)};
  const prisma={gymbroUserProfile:{
    findUnique:async({where})=>where.userId===row.userId?structuredClone(row):null,
    updateMany:async({where,data})=>{if(where.userId!==row.userId||where.updatedAt.getTime()!==row.updatedAt.getTime())return {count:0};row={...row,...data,updatedAt:new Date(row.updatedAt.getTime()+1)};return {count:1};},
  },$queryRaw:async(strings,patch,nextStep,userId)=>{
    assert.match(strings.join(''),/UPDATE "gymbro_user_profiles"/);
    if(userId!==row.userId)return [];
    row={...row,questionnaireV3:{...row.questionnaireV3,...JSON.parse(patch)},etapeActuelle:Math.max(row.etapeActuelle,nextStep),questionnaireComplet:false,matchingStatus:'PENDING',matchingProgramId:null,updatedAt:new Date(row.updatedAt.getTime()+1)};
    return [structuredClone(row)];
  }};
  return {service:new QuestionnaireService(prisma),prisma,row:()=>row};
}

test('profile accepts ages under 18 and rejects invalid ages without saving',async()=>{
  const f=fixture();
  await f.service.saveV3Step('user',2,{...steps[2],ageYears:17});
  assert.equal((await f.service.getMyProfile('user')).ageYears,17);
  for(const ageYears of [0,-1,1.5,81,'17',null]) {
    await assert.rejects(f.service.saveV3Step('user',2,{...steps[2],ageYears}),e=>e.getStatus()===400);
  }
  assert.equal((await f.service.getMyProfile('user')).ageYears,17);
});

test('all ten specific muscle priorities can be saved and restored',async()=>{
  const f=fixture();
  const priorityMuscles=['PECTORAUX','DOS','EPAULES','BICEPS','TRICEPS','ABDOMINAUX','FESSIERS','QUADRICEPS','ISCHIO','MOLLETS'];
  await f.service.saveV3Step('user',1,{...steps[1],priorityMuscles});
  assert.deepEqual((await f.service.getMyProfile('user')).priorityMuscles,priorityMuscles);
});

test('all eight mobile steps persist and reload without dropping nulls, sports or equipment',async()=>{
  const f=fixture();
  await Promise.all(Object.entries(steps).map(([step,payload])=>f.service.saveV3Step('user',+step,payload)));
  const profile=await f.service.getMyProfile('user');
  assert.equal(profile.primaryGoal,'PERTE_GRAISSE');assert.equal(profile.weightKg,null);
  assert.equal(profile.currentStep,9);assert.equal(profile.trainingLevel,'BEGINNER');
  assert.deepEqual(profile.sportSchedules,[{sport:'Football',sessionsPerWeek:2,days:[3,6]}]);
  assert.deepEqual(profile.equipmentStations,['LEG_PRESS']);
  const result=await f.service.validateV3('user');assert.equal(result.isComplete,true);
  assert.equal((await f.service.getMyProfile('user')).isComplete,true);
});
test('medical restrictions cannot be bypassed with a client safety status or legacy submit',async()=>{
  const f=fixture();for(const [step,payload] of Object.entries(steps))await f.service.saveV3Step('user',+step,payload);
  await f.service.saveV3Step('user',4,{...steps[4],hasExertionalWarningSymptoms:true});
  assert.equal((await f.service.getMyProfile('user')).safetyStatus,'NEEDSMEDICALREVIEW');
  await assert.rejects(f.service.validateV3('user'),e=>e.getStatus()===400);
  await assert.rejects(f.service.submit('user'),e=>e.getStatus()===400);
  assert.equal(f.row().questionnaireComplet,false);
});
test('unknown safety responses and missing steps block submission instead of becoming false',async()=>{
  const f=fixture();await f.service.saveV3Step('user',4,{...steps[4],hasMedicalExerciseRestriction:null});
  assert.equal((await f.service.getMyProfile('user')).hasMedicalExerciseRestriction,null);
  await assert.rejects(f.service.validateV3('user'),e=>e.getStatus()===400);
});
test('invalid step, mass assignment and malformed nested data are rejected without saving',async()=>{
  const f=fixture();
  for(const [step,payload] of [[9,{}],[1,{...steps[1],questionnaireComplet:true}],[6,{...steps[6],sessionsPerWeek:99}],[3,{...steps[3],sportSchedules:[{sport:'Football',sessionsPerWeek:2,days:[9]}]}],[5,{...steps[5],equipmentStations:['SECRET_MACHINE']}]])
    await assert.rejects(f.service.saveV3Step('user',step,payload),e=>e.getStatus()===400);
  assert.equal(f.row().questionnaireV3,null);
});
test('editing a completed questionnaire invalidates completion and any stale match',async()=>{
  const f=fixture();for(const [step,payload] of Object.entries(steps))await f.service.saveV3Step('user',+step,payload);
  await f.service.validateV3('user');await f.service.saveV3Step('user',1,{...steps[1],primaryGoal:'FORCE'});
  assert.equal(f.row().questionnaireComplet,false);assert.equal(f.row().matchingProgramId,null);
});
test('V3 never falls through to the legacy matcher or exposes an old matched program',async()=>{
  const {MatchingService}=require('../matching/matching.service.ts');
  const profile={questionnaireV3:{step1:steps[1]},questionnaireComplet:true,matchingStatus:'MATCHED',matchingProgramId:'stale'};
  const service=new MatchingService({gymbroUserProfile:{findUnique:async()=>profile},gymbroProgram:{findMany:async()=>[]},gymbroProfileSnapshot:{findFirst:async()=>null},gymbroMatchingDecision:{create:async(x)=>x.data}},{});
  const run=await service.run('user');assert.equal(run.matched,false);assert.match(run.reason,/préparation/);
  const result=await service.getResult('user');assert.equal(result.matched,false);assert.match(result.reason,/préparation/);
});
test('real HTTP routes accept mobile PATCH and validate, with the existing JWT guard',async t=>{
  const {Module,ValidationPipe}=require('@nestjs/common');const {NestFactory}=require('@nestjs/core');
  const {ConfigService}=require('@nestjs/config');const {JwtService}=require('@nestjs/jwt');
  const {PrismaService}=require('../../prisma/prisma.service.ts');
  const {GymbroJwtStrategy}=require('../auth/strategies/gymbro-jwt.strategy.ts');
  const {QuestionnaireController}=require('./questionnaire.controller.ts');
  const f=fixture();f.prisma.gymbroUser={findUnique:async({where})=>where.id==='user'?{id:'user',actif:true}:null};
  class TestModule{};Module({controllers:[QuestionnaireController],providers:[GymbroJwtStrategy,{provide:ConfigService,useValue:new ConfigService({JWT_SECRET:'test-only'})},{provide:PrismaService,useValue:f.prisma},{provide:QuestionnaireService,useValue:f.service}]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));await app.listen(0,'127.0.0.1');t.after(()=>app.close());
  const origin=await app.getUrl();const token=new JwtService({secret:'test-only'}).sign({sub:'user',app:'gymbro'});
  const send=(path,method,body,auth=true)=>fetch(origin+'/api/v1/gymbro/questionnaire'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await send('/step/1','PATCH',steps[1],false)).status,401);
  for(const [step,payload] of Object.entries(steps)){const r=await send('/step/'+step,'PATCH',payload);assert.equal(r.status,200,await r.text());}
  const r=await send('/validate','POST');assert.equal(r.status,201,await r.text());
  const reloaded=await (await send('','GET')).json();assert.equal(reloaded.isComplete,true);assert.equal(reloaded.primaryGoal,'PERTE_GRAISSE');
});
