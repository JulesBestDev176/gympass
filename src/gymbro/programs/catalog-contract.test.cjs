'use strict';
require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProgramManifest } = require('./contracts/program-manifest.schema.ts');

// ── helpers ──────────────────────────────────────────────────────────────────

function minimalPrescription(overrides = {}) {
  return {
    metric: 'REPS',
    workingSets: 2,
    repsMin: 8,
    repsMax: 12,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    distanceMinMeters: null,
    distanceMaxMeters: null,
    targetRirMin: 2,
    targetRirMax: 3,
    restTargetSeconds: 120,
    restAllowedMaxSeconds: 180,
    loadConvention: 'PER_DUMBBELL',
    initialLoadKg: null,
    ...overrides,
  };
}

function minimalSlot(prescriptionOverrides = {}) {
  return {
    slotCode: 'SQ',
    role: 'BILATERAL_KNEE',
    required: true,
    prescription: minimalPrescription(prescriptionOverrides),
    options: [
      {
        exerciseCode: 'db-goblet-squat',
        grade: 'PRIMARY',
        priority: 1,
        approved: true,
        prescriptionOverride: {},
      },
    ],
  };
}

function minimalSession(sessionNumber = 1, blueprintCode = 'D-A') {
  return {
    occurrenceCode: `W01-${blueprintCode}-${sessionNumber}`,
    blueprintCode,
    sessionNumber,
    format: 'STANDARD',
    slots: [minimalSlot()],
    rounds: null,
    betweenExerciseRestSeconds: null,
    betweenRoundRestSeconds: null,
    estimatedSeconds: 2700,
    measuredSeconds: null,
  };
}

function buildWeeks(count = 12) {
  return Array.from({ length: count }, (_, i) => ({
    weekNumber: i + 1,
    phaseNumber: Math.ceil((i + 1) / 3),
    sessions: [minimalSession(1, 'D-A'), minimalSession(2, 'D-B')],
  }));
}

function minimalManifest(overrides = {}) {
  return {
    schemaVersion: 'gymbro-program-catalog/1',
    familyCode: 'P01',
    versionCode: 'P01-L-v1',
    status: 'DRAFT',
    durationWeeks: 12,
    goalCoverage: ['PRISE_MUSCLE'],
    prescriptionPolicy: 'foundation-12w-v1',
    progressionPolicy: 'double-progression-v1',
    maxSessionMinutes: 50,
    weeks: buildWeeks(12),
    ...overrides,
  };
}

// ── Test 1: Reject schemaVersion !== 'gymbro-program-catalog/1' ───────────────
test('rejects unknown schemaVersion', () => {
  const result = validateProgramManifest(minimalManifest({ schemaVersion: 'unknown' }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(i => i.path === 'schemaVersion'),
    'expected an issue at path "schemaVersion"');
});

// ── Test 2: Reject durationWeeks !== 12 (e.g. 11 weeks) ─────────────────────
test('rejects durationWeeks other than 12', () => {
  const result = validateProgramManifest(minimalManifest({ durationWeeks: 11, weeks: buildWeeks(11) }));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(i => i.path === 'durationWeeks'),
    'expected an issue at path "durationWeeks"');
});

// ── Test 3: Reject repsMin > repsMax (inverted) ───────────────────────────────
test('rejects repsMin > repsMax', () => {
  const weeks = buildWeeks(12);
  weeks[0].sessions[0].slots[0].prescription = minimalPrescription({ repsMin: 15, repsMax: 8 });
  const result = validateProgramManifest(minimalManifest({ weeks }));
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(i => i.path.includes('repsMin')),
    `expected an issue mentioning repsMin; got: ${JSON.stringify(result.issues)}`
  );
});

// ── Test 4: Reject restTargetSeconds < 0 ────────────────────────────────────
test('rejects negative restTargetSeconds', () => {
  const weeks = buildWeeks(12);
  weeks[0].sessions[0].slots[0].prescription = minimalPrescription({ restTargetSeconds: -10 });
  const result = validateProgramManifest(minimalManifest({ weeks }));
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(i => i.path.includes('restTargetSeconds')),
    `expected an issue mentioning restTargetSeconds; got: ${JSON.stringify(result.issues)}`
  );
});

// ── Test 5: Reject durationMinSeconds on a REPS-metric prescription ──────────
test('rejects durationMinSeconds when metric is REPS', () => {
  const weeks = buildWeeks(12);
  weeks[0].sessions[0].slots[0].prescription = minimalPrescription({
    metric: 'REPS',
    durationMinSeconds: 30,
  });
  const result = validateProgramManifest(minimalManifest({ weeks }));
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(i => i.path.includes('durationMinSeconds')),
    `expected an issue mentioning durationMinSeconds; got: ${JSON.stringify(result.issues)}`
  );
});

// ── Test 6: Reject numeric sourceId (must be string like '0289') ─────────────
test('rejects numeric sourceId in ExerciseBinding', () => {
  const manifest = minimalManifest();
  manifest.exerciseBindings = [
    { exerciseCode: 'db-goblet-squat', sourceId: 289, sourceRevision: 'rev1', reviewStatus: 'VALIDATED' },
  ];
  const result = validateProgramManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(i => i.path.includes('sourceId')),
    `expected an issue mentioning sourceId; got: ${JSON.stringify(result.issues)}`
  );
});

// ── Test 7: Reject duplicate versionCode in families array ───────────────────
test('rejects duplicate versionCode within same family', () => {
  const manifest = minimalManifest();
  manifest.families = [
    { familyCode: 'P01', versionCode: 'P01-L-v1', goalCoverage: ['PRISE_MUSCLE'] },
    { familyCode: 'P01', versionCode: 'P01-L-v1', goalCoverage: ['FORME_GENERALE'] },
  ];
  const result = validateProgramManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some(i => i.path.includes('versionCode')),
    `expected an issue mentioning versionCode; got: ${JSON.stringify(result.issues)}`
  );
});

// ── Test 8: Accept initialLoadKg: null ───────────────────────────────────────
test('accepts initialLoadKg: null as valid', () => {
  const manifest = minimalManifest();
  manifest.weeks[0].sessions[0].slots[0].prescription.initialLoadKg = null;
  const result = validateProgramManifest(manifest);
  assert.equal(result.valid, true, `expected valid but got issues: ${JSON.stringify(result.issues)}`);
});

// ── Test 9: Accept a minimal valid manifest ──────────────────────────────────
test('accepts a minimal valid manifest', () => {
  const result = validateProgramManifest(minimalManifest());
  assert.equal(result.valid, true, `expected valid but got issues: ${JSON.stringify(result.issues)}`);
});

// ── Test 10: Verify checksum is a 64-char hex SHA-256 string ────────────────
test('checksum is a 64-char hex SHA-256 string', () => {
  const result = validateProgramManifest(minimalManifest());
  assert.match(result.checksum, /^[0-9a-f]{64}$/,
    `expected 64-char hex SHA-256; got: ${result.checksum}`);
});
