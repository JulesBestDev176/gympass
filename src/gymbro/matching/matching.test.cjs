'use strict';
require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchProgram, RULES_VERSION } = require('./matching-engine-v2.ts');

// ── Fixture helpers ─────────────────────────────────────────────────────────

function makeVersion(overrides) {
  return {
    id: overrides.id || 'v-' + overrides.versionCode,
    versionCode: overrides.versionCode,
    familyCode: overrides.familyCode,
    goalCoverage: overrides.goalCoverage || ['FORME_GENERALE'],
    sessionsPerWeek: overrides.sessionsPerWeek || 3,
    maxSessionMinutes: overrides.maxSessionMinutes || 60,
    prescriptionPolicy: overrides.prescriptionPolicy || 'foundation-12w-v1',
    progressionPolicy: overrides.progressionPolicy || 'double-progression-v1',
  };
}

// Test 1: Beginner + 3j/sem + salle → P01-L-v1
test('Beginner + 3j/sem + salle → MATCHED with P02-L-v1 (3 sessions/week beginner)', () => {
  // P02 has 3 sessions/week for beginners, P01 has 2 sessions/week
  const profile = {
    userId: 'user-1',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'BEGINNER',
    sessionsPerWeek: 3,
    primaryTrainingLocation: 'SALLE',
    primaryGoal: 'FORME_GENERALE',
    availableEquipment: ['MACHINES', 'HALTERES'],
  };
  const publishedVersions = [
    makeVersion({ versionCode: 'P01-L-v1', familyCode: 'P01', goalCoverage: ['PRISE_MUSCLE', 'FORME_GENERALE', 'FORCE'], sessionsPerWeek: 2 }),
    makeVersion({ versionCode: 'P01-M-v1', familyCode: 'P01', goalCoverage: ['PRISE_MUSCLE', 'FORME_GENERALE', 'FORCE'], sessionsPerWeek: 2 }),
    makeVersion({ versionCode: 'P02-L-v1', familyCode: 'P02', goalCoverage: ['PRISE_MUSCLE', 'FORME_GENERALE', 'FORCE'], sessionsPerWeek: 3 }),
    makeVersion({ versionCode: 'P02-M-v1', familyCode: 'P02', goalCoverage: ['PRISE_MUSCLE', 'FORME_GENERALE', 'FORCE'], sessionsPerWeek: 3 }),
  ];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'MATCHED');
  assert.ok(result.score > 0, 'Score should be positive');
  // Beginner + 3 sessions/week → P02-L-v1 is best (exact sessions match + level match + goal match + L variant)
  assert.equal(result.versionCode, 'P02-L-v1');
});

// Test 2: Medical restriction → NEEDS_MEDICAL_REVIEW
test('Medical restriction → NEEDS_MEDICAL_REVIEW regardless of other fields', () => {
  const profile = {
    userId: 'user-2',
    safetyStatus: 'NEEDSMEDICALREVIEW',
    trainingLevel: 'INTERMEDIATE',
    sessionsPerWeek: 3,
    primaryTrainingLocation: 'SALLE',
    availableEquipment: ['MACHINES', 'HALTERES'],
  };
  const publishedVersions = [
    makeVersion({ versionCode: 'P05-L-v1', familyCode: 'P05', goalCoverage: ['PRISE_MUSCLE'], sessionsPerWeek: 3 }),
  ];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'NEEDS_MEDICAL_REVIEW');
  assert.equal(result.versionCode, null);
  assert.equal(result.score, null);
  assert.ok(result.reasonCodes.includes('MEDICAL_REVIEW_REQUIRED'));
});

// Test 3: Unknown safety → NEEDS_CLARIFICATION (missing sessionsPerWeek)
test('CLEARED status but sessionsPerWeek null → NEEDS_CLARIFICATION', () => {
  const profile = {
    userId: 'user-3',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'BEGINNER',
    sessionsPerWeek: null,
    primaryTrainingLocation: 'SALLE',
    availableEquipment: ['MACHINES'],
  };
  const publishedVersions = [
    makeVersion({ versionCode: 'P01-L-v1', familyCode: 'P01', sessionsPerWeek: 3 }),
  ];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'NEEDS_CLARIFICATION');
  assert.ok(result.reasonCodes.includes('MISSING_SESSIONS_PER_WEEK'));
});

// Test 4: Machine-only gym → M variant
test('Machine-only gym → versionCode ends with -M-v1', () => {
  const profile = {
    userId: 'user-4',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'INTERMEDIATE',
    sessionsPerWeek: 4,
    primaryTrainingLocation: 'SALLE',
    primaryGoal: 'PRISE_MUSCLE',
    availableEquipment: ['MACHINES'],  // no dumbbells, no barbells
  };
  const publishedVersions = [
    makeVersion({ versionCode: 'P06-L-v1', familyCode: 'P06', goalCoverage: ['PRISE_MUSCLE'], sessionsPerWeek: 4 }),
    makeVersion({ versionCode: 'P06-M-v1', familyCode: 'P06', goalCoverage: ['PRISE_MUSCLE'], sessionsPerWeek: 4 }),
  ];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'MATCHED');
  assert.ok(result.versionCode.endsWith('-M-v1'), `Expected versionCode to end with -M-v1, got: ${result.versionCode}`);
});

// Test 5: Home training → domicile family
test('Home training (DOMICILE) → familyCode in P18/P19/P20', () => {
  const profile = {
    userId: 'user-5',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'BEGINNER',
    sessionsPerWeek: 3,
    primaryTrainingLocation: 'DOMICILE',
    availableEquipment: ['POIDS_CORPS'],
  };
  const publishedVersions = [
    makeVersion({ versionCode: 'P01-L-v1', familyCode: 'P01', sessionsPerWeek: 3 }),  // salle only
    makeVersion({ versionCode: 'P18-L-v1', familyCode: 'P18', sessionsPerWeek: 3 }),  // domicile
    makeVersion({ versionCode: 'P19-L-v1', familyCode: 'P19', sessionsPerWeek: 3 }),  // domicile
    makeVersion({ versionCode: 'P20-L-v1', familyCode: 'P20', sessionsPerWeek: 3 }),  // domicile
  ];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'MATCHED');
  const familyCode = result.versionCode.substring(0, 3);
  assert.ok(['P18', 'P19', 'P20'].includes(familyCode), `Expected domicile family, got: ${familyCode}`);
});

// Test 6: No published version → NO_COVERAGE
test('No published versions → NO_COVERAGE', () => {
  const profile = {
    userId: 'user-6',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'BEGINNER',
    sessionsPerWeek: 3,
    primaryTrainingLocation: 'SALLE',
    availableEquipment: ['MACHINES'],
  };
  const publishedVersions = [];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'NO_COVERAGE');
  assert.ok(result.reasonCodes.includes('NO_ELIGIBLE_VERSION'));
});

// Test 7: Score ordering — closer sessionsPerWeek match wins
test('Score ordering: closer sessionsPerWeek match gets higher score', () => {
  const profile = {
    userId: 'user-7',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'BEGINNER',
    sessionsPerWeek: 3,
    primaryTrainingLocation: 'SALLE',
    primaryGoal: 'FORME_GENERALE',
    availableEquipment: ['MACHINES', 'HALTERES'],
  };
  const publishedVersions = [
    // P01: 2 sessions/week — diff of 1
    makeVersion({ versionCode: 'P01-L-v1', familyCode: 'P01', goalCoverage: ['FORME_GENERALE'], sessionsPerWeek: 2 }),
    // P02: 3 sessions/week — exact match
    makeVersion({ versionCode: 'P02-L-v1', familyCode: 'P02', goalCoverage: ['FORME_GENERALE'], sessionsPerWeek: 3 }),
  ];
  const result = matchProgram(profile, publishedVersions);
  assert.equal(result.status, 'MATCHED');
  // P02-L-v1 should win because it has exact sessions match
  assert.equal(result.versionCode, 'P02-L-v1', 'P02 should win over P01 due to exact sessions match');
});

// Test 8: rulesVersion is stable
test('rulesVersion is the same constant for identical inputs', () => {
  const profile = {
    userId: 'user-8',
    safetyStatus: 'CLEAREDFORSTANDARDONBOARDING',
    trainingLevel: 'INTERMEDIATE',
    sessionsPerWeek: 4,
    primaryTrainingLocation: 'SALLE',
    availableEquipment: ['MACHINES', 'HALTERES'],
  };
  const publishedVersions = [
    makeVersion({ versionCode: 'P06-L-v1', familyCode: 'P06', sessionsPerWeek: 4 }),
  ];
  const result1 = matchProgram(profile, publishedVersions);
  const result2 = matchProgram(profile, publishedVersions);
  assert.equal(result1.rulesVersion, result2.rulesVersion);
  assert.equal(result1.rulesVersion, RULES_VERSION);
  assert.equal(typeof result1.rulesVersion, 'string');
  assert.ok(result1.rulesVersion.length > 0);
});
