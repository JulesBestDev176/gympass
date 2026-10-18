import { BadRequestException } from '@nestjs/common';

type Rule = (value: unknown) => boolean;
const text: Rule = v => typeof v === 'string' && v.length <= 2000;
const bool: Rule = v => typeof v === 'boolean';
const number = (min: number, max: number, integer = false): Rule => v =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v));
const one = (...values: string[]): Rule => v => typeof v === 'string' && values.includes(v);
const nullable = (rule: Rule): Rule => v => v === null || rule(v);
const array = (rule: Rule, max = 50): Rule => v => Array.isArray(v) && v.length <= max && v.every(rule);
const strings = array(text);
const days = array(number(1, 7, true), 7);
const goals = one('PRISE_MUSCLE', 'PERTE_GRAISSE', 'FORCE', 'FORME_GENERALE');
const locations = one('SALLE', 'DOMICILE', 'PLEIN_AIR', 'STADE');
const equipment = one('AUCUN', 'POIDS_CORPS', 'HALTERES', 'BARRE_DISQUES', 'BANC', 'RACK', 'POULIES', 'MACHINES', 'BARRE_TRACTION', 'BARRES_PARALLELES', 'ELASTIQUES', 'KETTLEBELL', 'INCONNU');
const stations = one('LEG_PRESS','HACK_SQUAT','SMITH','CHEST_PRESS','SHOULDER_PRESS','LAT_PULLDOWN','SEATED_ROW','LEG_CURL','LEG_EXTENSION','HIGH_PULLEY','LOW_PULLEY');
const conditions = one('HTA','DIABETE','ASTHME','DREPANOCYTOSE','TRAIT_DREPANO','MALADIE_CARDIAQUE','AUTRE','INCONNU');
const object = (rules: Record<string, Rule>, required: string[] = []): Rule => value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return required.every(key => Object.prototype.hasOwnProperty.call(data, key)) &&
    Object.entries(data).every(([key, item]) => Object.prototype.hasOwnProperty.call(rules, key) && rules[key](item));
};
const sport = object({sport:text,sessionsPerWeek:nullable(number(1,7,true)),days}, ['sport','days']);
const limitation = object({bodyRegion:text,painCurrentlyPresent:bool,painDuringExercise:bool,triggeringMovements:strings,knownMedicalRestrictions:strings}, ['bodyRegion']);
const performance = object({exerciceId:text,chargeKg:nullable(number(0,2000)),reps:number(1,1000,true),sets:number(1,100,true),effortRating:one('FACILE','MODERE','DIFFICILE'),rir:number(0,10,true)}, ['exerciceId','reps']);
const schemas: Record<number, Record<string, Rule>> = {
  1: {primaryGoal:goals,secondaryGoal:nullable(goals),priorityMuscles:array(one('PECTORAUX','DOS','EPAULES','BICEPS','TRICEPS','ABDOMINAUX','FESSIERS','QUADRICEPS','ISCHIO','MOLLETS','TOUT_LE_CORPS'),3),goalTimeframe:nullable(text)},
  2: {ageYears:number(18,80,true),sexForTraining:one('HOMME','FEMME','NON_RENSEIGNE'),heightCm:nullable(number(100,250)),weightKg:nullable(number(25,350)),targetWeightKg:nullable(number(25,350))},
  3: {experienceDuration:one('JAMAIS','MOINS_6_MOIS','SIX_MOIS_DEUX_ANS','PLUS_DEUX_ANS'),recentConsistency:one('NEVER','RARELY','SOMETIMES','REGULARLY'),trainingBreak:one('PAS_ARRET','MOINS_1_MOIS','UN_TROIS_MOIS','PLUS_3_MOIS'),techniqueConfidence:one('DISCOVERING','KNOWS_SOME','CONFIDENT'),trainingLevel:one('BEGINNER','INTERMEDIATE','ADVANCED'),otherSports:strings,sportSchedules:array(sport),activityLevel:one('SEDENTAIRE','DEBOUT','PHYSIQUE')},
  4: {consentGiven:bool,hasMedicalExerciseRestriction:nullable(bool),hasRelevantMedicalCondition:nullable(bool),hasCurrentPainOrInjury:nullable(bool),hasExertionalWarningSymptoms:nullable(bool),isPregnantOrPostpartum:nullable(bool),safetyStatus:one('CLEAREDFORSTANDARDONBOARDING','NEEDSEXERCISEMODIFICATION','NEEDSMEDICALREVIEW'),declaredConditions:array(conditions),bodyLimitations:array(limitation)},
  5: {trainingLocations:array(locations,4),primaryTrainingLocation:locations,availableEquipment:array(equipment,20),equipmentStations:array(stations,11),equipmentKnowledge:one('KNOWN','PARTIAL','UNKNOWN'),canTrainWithoutEquipment:bool},
  6: {sessionsPerWeek:number(1,7,true),sessionDurationMinutes:v=>[20,30,45,60,90,120].includes(v as number),preferredDays:days,preferredTime:one('MATIN','APRESMIDI','SOIR','VARIABLE'),scheduleFlexibility:one('FIXED','VARIABLE')},
  7: {sleepCategory:one('MOINS5H','CINQSEPTH','SEPTNEUFH','PLUS9H','VARIABLE'),usualFatigue:one('RARELY','SOMETIMES','OFTEN'),eatingAdequately:one('YES','NOTALWAYS','DONTKNOW'),trainsWhileFasting:one('SOUVENT','PARFOIS','JAMAIS'),currentlyFasting:bool,fastingPattern:one('RAMADAN','AUTREJEUNE','NONRENSEIGNE'),preferredTrainingRelativeToFast:one('AVANTRUPTURE','APRESRUPTURE','VARIABLE'),supplements:strings},
  8: {preferredExercises:strings,avoidedExercises:strings,programVariety:one('ROUTINESTABLE','VARIE','SANSPREFERENCE'),performances:array(performance),notes:nullable(text)},
};
const required: Record<number, string[]> = {
  1:['primaryGoal'],2:['ageYears'],3:['experienceDuration','recentConsistency','trainingBreak','techniqueConfidence'],
  4:['consentGiven','hasMedicalExerciseRestriction','hasRelevantMedicalCondition','hasCurrentPainOrInjury','hasExertionalWarningSymptoms'],
  5:['trainingLocations','primaryTrainingLocation','availableEquipment'],6:['sessionsPerWeek','sessionDurationMinutes','preferredDays'],7:[],8:[],
};

export function validateV3Step(step: number, input: unknown): Record<string, any> {
  if (!Number.isInteger(step) || !schemas[step]) throw new BadRequestException('Étape de questionnaire inconnue.');
  if (!object(schemas[step], required[step])(input) || Buffer.byteLength(JSON.stringify(input)) > 65536) {
    throw new BadRequestException(`Réponses invalides à l’étape ${step}. Vérifie les champs et leurs valeurs.`);
  }
  const data = JSON.parse(JSON.stringify(input));
  if (step === 3 && data.sportSchedules?.some((s: any) => !data.otherSports?.includes(s.sport))) {
    throw new BadRequestException('Les horaires doivent correspondre aux sports sélectionnés.');
  }
  if (step === 5 && (!data.trainingLocations.length || !data.trainingLocations.includes(data.primaryTrainingLocation))) {
    throw new BadRequestException('Choisis un lieu principal parmi les lieux sélectionnés.');
  }
  if (step === 6 && new Set(data.preferredDays).size !== data.preferredDays.length) {
    throw new BadRequestException('Les jours sélectionnés doivent être différents.');
  }
  // These values are derived from answers, never trusted from the client.
  delete data.trainingLevel;
  delete data.safetyStatus;
  return data;
}

export function flattenV3(stored: unknown): Record<string, any> {
  const steps = (stored ?? {}) as Record<string, any>;
  const data: Record<string, any> = {};
  for (let step = 1; step <= 8; step++) Object.assign(data, steps[`step${step}`] ?? {});
  const novice = !data.experienceDuration || data.experienceDuration === 'JAMAIS' ||
    data.experienceDuration === 'MOINS_6_MOIS' || data.trainingBreak === 'PLUS_3_MOIS' ||
    ['DISCOVERING','KNOWS_SOME'].includes(data.techniqueConfidence);
  data.trainingLevel = novice ? 'BEGINNER' : data.experienceDuration === 'SIX_MOIS_DEUX_ANS' ? 'INTERMEDIATE' : 'ADVANCED';
  const flags = ['hasMedicalExerciseRestriction','hasRelevantMedicalCondition','hasCurrentPainOrInjury','hasExertionalWarningSymptoms'];
  const medical = data.consentGiven !== true || flags.some(key => typeof data[key] !== 'boolean') ||
    data.hasMedicalExerciseRestriction || data.hasExertionalWarningSymptoms || data.isPregnantOrPostpartum === true ||
    data.declaredConditions?.some((c: string) => ['DREPANOCYTOSE','MALADIE_CARDIAQUE'].includes(c));
  data.safetyStatus = medical ? 'NEEDSMEDICALREVIEW' :
    data.hasRelevantMedicalCondition || data.hasCurrentPainOrInjury || data.declaredConditions?.length || data.bodyLimitations?.length
      ? 'NEEDSEXERCISEMODIFICATION' : 'CLEAREDFORSTANDARDONBOARDING';
  return data;
}

export const V3_PROGRAM_PENDING_REASON = 'Tes réponses sont enregistrées. Les programmes compatibles avec ce nouveau questionnaire sont en cours de préparation.';
