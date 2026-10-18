require('ts-node/register/transpile-only');
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {QuestionnaireService}=require('./questionnaire.service.ts');
const connection=process.env.QUESTIONNAIRE_TEST_DATABASE_URL;

test('PostgreSQL additive migration preserves legacy answers and atomic step saves survive concurrency',{skip:!connection},async t=>{
  const url=new URL(connection);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15441');assert.equal(url.pathname,'/gymbro_questionnaire_test');
  const db=new PrismaClient({datasources:{db:{url:connection}}});t.after(()=>db.$disconnect());
  const user=await db.gymbroUser.create({data:{email:'questionnaire-fixture@example.test',passwordHash:'not-a-real-password',prenom:'Fixture',nom:'Questionnaire',profile:{create:{objectifPrincipal:'FORCE',age:35,poidsKg:80}}},include:{profile:true}});
  // This schema is isolated by the three connection guards above.
  await db.$executeRawUnsafe('ALTER TABLE "gymbro_user_profiles" DROP COLUMN "questionnaireV3"');
  const sql=fs.readFileSync(path.resolve(__dirname,'../../../prisma/migrations/20261018130000_questionnaire_v3/migration.sql'),'utf8');
  await db.$executeRawUnsafe(sql);await db.$executeRawUnsafe(sql);
  const service=new QuestionnaireService(db);
  const steps={
    1:{primaryGoal:'PERTE_GRAISSE',priorityMuscles:[]},2:{ageYears:27,heightCm:null,weightKg:null},
    3:{experienceDuration:'JAMAIS',recentConsistency:'NEVER',trainingBreak:'PAS_ARRET',techniqueConfidence:'DISCOVERING',otherSports:[],sportSchedules:[]},
    4:{consentGiven:true,hasMedicalExerciseRestriction:false,hasRelevantMedicalCondition:false,hasCurrentPainOrInjury:false,hasExertionalWarningSymptoms:false,declaredConditions:[],bodyLimitations:[]},
    5:{trainingLocations:['SALLE'],primaryTrainingLocation:'SALLE',availableEquipment:['MACHINES'],equipmentStations:['LEG_PRESS']},
    6:{sessionsPerWeek:4,sessionDurationMinutes:60,preferredDays:[1,2,4,6]},7:{sleepCategory:'CINQSEPTH'},8:{performances:[],notes:null},
  };
  await Promise.all(Object.entries(steps).map(([step,data])=>service.saveV3Step(user.id,+step,data)));
  const row=await db.gymbroUserProfile.findUnique({where:{userId:user.id}});
  assert.equal(Object.keys(row.questionnaireV3).length,8);assert.equal(row.objectifPrincipal,'FORCE');assert.equal(row.poidsKg,80);
  const reloaded=await service.getMyProfile(user.id);assert.equal(reloaded.weightKg,null);assert.equal(reloaded.currentStep,9);assert.equal(reloaded.trainingLevel,'BEGINNER');
  await service.validateV3(user.id);assert.equal((await service.getMyProfile(user.id)).isComplete,true);
  await service.saveV3Step(user.id,4,{...steps[4],hasExertionalWarningSymptoms:true});
  await assert.rejects(service.validateV3(user.id),e=>e.getStatus()===400);
  assert.equal((await service.getMyProfile(user.id)).isComplete,false);
});
