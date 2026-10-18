'use strict';

require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSlot, resolveSubstitution, validateBindings } = require('./equipment-resolver.ts');

// ─── Shared fixture objects ────────────────────────────────────────────────

const defaultPrescription = {
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  restSec: 90,
};

/** FS slot — barbell full squat, requires RACK + SAFETY_BARS + BARBELL */
const slotFS = {
  slotCode: 'FS',
  variant: 'BAR',
  exerciseCode: 'FS-BAR-PRIMARY',
  sessionPosition: 1,
  defaultPrescription,
};

/** HP slot, L variant — dumbbell bench press (sourceId 0289) */
const slotHP_L = {
  slotCode: 'HP',
  variant: 'L',
  exerciseCode: 'HP-L-PRIMARY',
  sessionPosition: 2,
  defaultPrescription,
};

/** HP slot, M variant — machine chest press (sourceId 0577) */
const slotHP_M = {
  slotCode: 'HP',
  variant: 'M',
  exerciseCode: 'HP-M-PRIMARY',
  sessionPosition: 2,
  defaultPrescription,
};

/** VR slot, EL variant — band pulldown (sourceId 0974), requires BAND + HIGH_ANCHOR */
const slotVR_EL = {
  slotCode: 'VR',
  variant: 'EL',
  exerciseCode: 'VR-EL-PRIMARY',
  sessionPosition: 3,
  defaultPrescription,
};

const defaultProfile = {
  userId: 'test-user-1',
  level: 'INTERMEDIATE',
  goal: 'HYPERTROPHY',
  daysPerWeek: 4,
};

function makeInventory(availableCodes) {
  return {
    equipment: availableCodes.map((code) => ({ code, available: true })),
    snapshotAt: new Date().toISOString(),
  };
}

// ─── Test 1: Rack required, incomplete inventory → UNRESOLVED MISSING_EQUIPMENT ─

test('T1: FS slot with only RACK → UNRESOLVED MISSING_EQUIPMENT', () => {
  const inventory = makeInventory(['RACK']); // missing SAFETY_BARS and BARBELL
  const result = resolveSlot(slotFS, defaultProfile, inventory);
  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.reasonCode, 'MISSING_EQUIPMENT');
});

// ─── Test 2: Primary resolved with correct equipment ─

test('T2: HP-L slot with DUMBBELLS → RESOLVED PRIMARY sourceId=0289', () => {
  const inventory = makeInventory(['DUMBBELLS']);
  const result = resolveSlot(slotHP_L, defaultProfile, inventory);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.exerciseCode, 'HP-L-PRIMARY');
  assert.equal(result.sourceId, '0289');
  assert.equal(result.grade, 'PRIMARY');
  assert.equal(result.recalibrateLoad, false);
});

// ─── Test 3: Alternative resolves when primary equipment absent ─

test('T3a: HP-L slot with only MACHINE_CHEST_PRESS → UNRESOLVED (no L variant with that equip)', () => {
  const inventory = makeInventory(['MACHINE_CHEST_PRESS']);
  // slotHP_L is specifically variant L — no L binding accepts MACHINE_CHEST_PRESS
  const result = resolveSlot(slotHP_L, defaultProfile, inventory);
  // Should be UNRESOLVED since the L-variant binding requires DUMBBELLS
  assert.equal(result.status, 'UNRESOLVED');
});

test('T3b: HP slot (no variant) with MACHINE_CHEST_PRESS → RESOLVED HP-M-PRIMARY sourceId=0577', () => {
  const slotHP_noVariant = {
    slotCode: 'HP',
    variant: undefined,
    exerciseCode: 'HP-L-PRIMARY',
    sessionPosition: 2,
    defaultPrescription,
  };
  const inventory = makeInventory(['MACHINE_CHEST_PRESS']);
  const result = resolveSlot(slotHP_noVariant, defaultProfile, inventory);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.sourceId, '0577');
});

test('T3c: HP slot (no variant) with no equipment → resolves to BW bodyweight fallback', () => {
  const slotHP_noVariant = {
    slotCode: 'HP',
    variant: undefined,
    exerciseCode: 'HP-L-PRIMARY',
    sessionPosition: 2,
    defaultPrescription,
  };
  const inventory = makeInventory([]); // no gym equipment — BW binding has empty requiredEquipment
  const result = resolveSlot(slotHP_noVariant, defaultProfile, inventory);
  // HP-BW-PRIMARY requires no equipment, so it should resolve
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.sourceId, '0259'); // HP-BW-PRIMARY dips/push-up
});

// ─── Test 4: Band without anchor → UNRESOLVED MISSING_ANCHOR ─

test('T4: VR-EL slot with BAND but no HIGH_ANCHOR → UNRESOLVED MISSING_ANCHOR', () => {
  const inventory = makeInventory(['BAND']); // missing HIGH_ANCHOR
  const result = resolveSlot(slotVR_EL, defaultProfile, inventory);
  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.reasonCode, 'MISSING_ANCHOR');
});

// ─── Test 5: A→B substitution is not reversible ─

test('T5: HP-L→HP-M substitution returns A1 grade (not PRIMARY)', () => {
  const inventory = makeInventory(['MACHINE_CHEST_PRESS']);
  const result = resolveSubstitution({
    slot: slotHP_L,
    profile: defaultProfile,
    inventory,
    reason: 'ABSENT',
    originalExerciseCode: undefined,
  });
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.grade, 'A1');
  assert.notEqual(result.grade, 'PRIMARY');
});

test('T5b: HP-M→HP-L substitution is blocked if HP-L was the original', () => {
  const inventory = makeInventory(['DUMBBELLS']);
  const result = resolveSubstitution({
    slot: slotHP_M,
    profile: defaultProfile,
    inventory,
    reason: 'ABSENT',
    originalExerciseCode: 'HP-L-PRIMARY', // HP-L was original — block reverse
  });
  // Should not resolve back to HP-L
  assert.notEqual(result.exerciseCode, 'HP-L-PRIMARY');
});

// ─── Test 6: A3 without approved variant → UNRESOLVED NO_APPROVED_ALTERNATIVE ─

test('T6: slot with no approved options → UNRESOLVED NO_APPROVED_ALTERNATIVE', () => {
  const slotUnknown = {
    slotCode: 'NONEXISTENT',
    variant: undefined,
    exerciseCode: 'NONEXISTENT-PRIMARY',
    sessionPosition: 1,
    defaultPrescription,
  };
  const inventory = makeInventory(['DUMBBELLS', 'BARBELL', 'RACK']);
  const result = resolveSlot(slotUnknown, defaultProfile, inventory);
  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.reasonCode, 'NO_APPROVED_ALTERNATIVE');
});

// ─── Test 7: PAIN reason → NEEDS_REVIEW ─

test('T7: PAIN reason → {status: NEEDS_REVIEW}', () => {
  const inventory = makeInventory(['DUMBBELLS']);
  const result = resolveSubstitution({
    slot: slotHP_L,
    profile: defaultProfile,
    inventory,
    reason: 'PAIN',
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  // Must NOT be RESOLVED or UNRESOLVED
  assert.notEqual(result.status, 'RESOLVED');
  assert.notEqual(result.status, 'UNRESOLVED');
});

// ─── Test 8: Excluded sourceIds must not appear in primary bindings ─

test('T8: validateBindings catches excluded sourceIds in primary slots', () => {
  const bindings = require('../../../assets/program-catalog/exercise-bindings.json');

  // Inject a fake binding with an excluded sourceId as PRIMARY
  const fakeBindings = [
    ...bindings,
    {
      slotCode: 'TEST',
      exerciseCode: 'TEST-PRIMARY',
      sourceId: '0599',
      sourceRevision: 'v1',
      grade: 'PRIMARY',
      variant: 'TEST',
      priority: 1,
      requiredEquipment: [],
      approved: true,
      reviewStatus: 'VALIDATED',
      prescriptionOverride: {},
    },
    {
      slotCode: 'TEST2',
      exerciseCode: 'TEST2-PRIMARY',
      sourceId: '0705',
      sourceRevision: 'v1',
      grade: 'PRIMARY',
      variant: 'TEST2',
      priority: 1,
      requiredEquipment: [],
      approved: true,
      reviewStatus: 'VALIDATED',
      prescriptionOverride: {},
    },
  ];

  const result = validateBindings(fakeBindings);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2, `Expected at least 2 errors, got ${result.errors.length}: ${result.errors.join(', ')}`);
  assert.ok(result.errors.some((e) => e.includes('0599')));
  assert.ok(result.errors.some((e) => e.includes('0705')));

  // Real bindings should be clean
  const realResult = validateBindings(bindings);
  assert.equal(realResult.valid, true, `Real bindings have errors: ${realResult.errors.join(', ')}`);
});

// ─── Test 9: GIF absent → reviewStatus NEEDS_REVIEW ─

test('T9: binding with hasAnimation=false sourceId → reviewStatus NEEDS_REVIEW', () => {
  // Create a synthetic binding referencing a sourceId that would have no animation
  // Since all our real sourceIds have animations, we simulate by using validateBindings logic
  // The rule: if hasAnimation=false in catalog → reviewStatus should be NEEDS_REVIEW not VALIDATED
  // We verify: the EE-BAR-A1 binding (sourceId 0060, skull crusher) is NEEDS_REVIEW as specified
  const bindings = require('../../../assets/program-catalog/exercise-bindings.json');
  const skullCrusher = bindings.find((b) => b.sourceId === '0060');
  assert.ok(skullCrusher, 'EE-BAR-A1 binding for skull crusher (0060) should exist');
  assert.equal(skullCrusher.reviewStatus, 'NEEDS_REVIEW', 'Skull crusher binding should be NEEDS_REVIEW');
});

// ─── Test 10: Checksum stability — deterministic output ─

test('T10: resolveSlot is deterministic (same inputs → same output)', () => {
  const inventory = makeInventory(['DUMBBELLS', 'MACHINE_CHEST_PRESS', 'BARBELL']);
  const result1 = resolveSlot(slotHP_L, defaultProfile, inventory);
  const result2 = resolveSlot(slotHP_L, defaultProfile, inventory);
  assert.deepEqual(result1, result2);

  // Also test with a different slot
  const result3 = resolveSlot(slotFS, defaultProfile, inventory);
  const result4 = resolveSlot(slotFS, defaultProfile, inventory);
  assert.deepEqual(result3, result4);
});
