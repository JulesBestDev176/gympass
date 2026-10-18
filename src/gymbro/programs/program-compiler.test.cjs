'use strict';
require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compileProgram, estimateSessionSeconds } = require('./program-compiler.ts');
const { families } = require('../../../assets/program-catalog/families.json');
const bindings = require('../../../assets/program-catalog/exercise-bindings.json');
const { createHash } = require('node:crypto');

// Test 1: P01-L-v1 compiles to 12 weeks
test('P01-L-v1 compiles to 12 weeks', () => {
  const family = families.find(f => f.familyCode === 'P01');
  const manifest = compileProgram(family, 'P01-L-v1', bindings);
  assert.equal(manifest.weeks.length, 12);
});

// Test 2: P30 has 36 sessions
test('P30 has 36 sessions', () => {
  const family = families.find(f => f.familyCode === 'P30');
  const p30 = compileProgram(family, 'P30-L-v1', bindings);
  const totalSessions = p30.weeks.flatMap(w => w.sessions).length;
  assert.equal(totalSessions, 36);
});

// Test 3: P32 has 32 sessions
test('P32 has 32 sessions', () => {
  const family = families.find(f => f.familyCode === 'P32');
  const p32 = compileProgram(family, 'P32-L-v1', bindings);
  const totalSessions = p32.weeks.flatMap(w => w.sessions).length;
  assert.equal(totalSessions, 32);
});

// Test 4: P32 session distribution — [4,4,4,4,2,2,2,2,2,2,2,2]
test('P32 session distribution', () => {
  const family = families.find(f => f.familyCode === 'P32');
  const p32 = compileProgram(family, 'P32-L-v1', bindings);
  const distribution = p32.weeks.map(w => w.sessions.length);
  assert.deepEqual(distribution, [4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2]);
});

// Test 5: CT session is CIRCUIT format with rounds >= 2
test('CT session is CIRCUIT format', () => {
  const family = families.find(f => f.familyCode === 'P36');
  const manifest = compileProgram(family, 'P36-L-v1', bindings);
  const allSessions = manifest.weeks.flatMap(w => w.sessions);
  const ctSession = allSessions.find(s => s.blueprintCode === 'CT-A');
  assert.ok(ctSession, 'CT-A session should exist');
  assert.equal(ctSession.format, 'CIRCUIT');
  assert.ok(ctSession.rounds >= 2, `rounds should be >= 2, got ${ctSession.rounds}`);
  assert.notEqual(ctSession.betweenExerciseRestSeconds, null);
});

// Test 6: FS slot prescription has restTargetSeconds: 180
test('FS slot has restTargetSeconds 180', () => {
  const family = families.find(f => f.familyCode === 'P07');
  const manifest = compileProgram(family, 'P07-L-v1', bindings);
  const allSlots = manifest.weeks.flatMap(w => w.sessions.flatMap(s => s.slots));
  // F-A contains SQ, HP, HR, VP, EF, AE — no FS there
  // Use P11 which has G-A (FS, HP, HR, VP)
  const family11 = families.find(f => f.familyCode === 'P11');
  const manifest11 = compileProgram(family11, 'P11-L-v1', bindings);
  const fsSlot = manifest11.weeks
    .flatMap(w => w.sessions.flatMap(s => s.slots))
    .find(s => s.slotCode === 'FS');
  assert.ok(fsSlot, 'FS slot should exist in a program with G-A blueprint');
  assert.equal(fsSlot.prescription.restTargetSeconds, 180);
});

// Test 7: estimateSessionSeconds returns positive number
test('estimateSessionSeconds returns positive number', () => {
  const family = families.find(f => f.familyCode === 'P01');
  const manifest = compileProgram(family, 'P01-L-v1', bindings);
  const session = manifest.weeks[0].sessions[0];
  const result = estimateSessionSeconds(session);
  assert.ok(result > 0, `estimateSessionSeconds should return > 0, got ${result}`);
  assert.equal(typeof result, 'number');
  assert.ok(Number.isInteger(result), 'result should be an integer');
});

// Test 8: Determinism — two calls produce identical JSON checksums
test('compileProgram is deterministic', () => {
  const family = families.find(f => f.familyCode === 'P05');
  const m1 = compileProgram(family, 'P05-L-v1', bindings);
  const m2 = compileProgram(family, 'P05-L-v1', bindings);
  const hash1 = createHash('sha256').update(JSON.stringify(m1)).digest('hex');
  const hash2 = createHash('sha256').update(JSON.stringify(m2)).digest('hex');
  assert.equal(hash1, hash2);
});

// Test 9: L variant uses PER_DUMBBELL for HP slot
test('L variant uses PER_DUMBBELL for HP slot', () => {
  const family = families.find(f => f.familyCode === 'P01');
  const manifest = compileProgram(family, 'P01-L-v1', bindings);
  const hpSlot = manifest.weeks[0].sessions
    .flatMap(s => s.slots)
    .find(s => s.slotCode === 'HP');
  assert.ok(hpSlot, 'HP slot should exist');
  assert.equal(hpSlot.prescription.loadConvention, 'PER_DUMBBELL');
});

// Test 10: M variant uses MACHINE_DISPLAY for HP slot
test('M variant uses MACHINE_DISPLAY for HP slot', () => {
  const family = families.find(f => f.familyCode === 'P01');
  const manifest = compileProgram(family, 'P01-M-v1', bindings);
  const hpSlot = manifest.weeks[0].sessions
    .flatMap(s => s.slots)
    .find(s => s.slotCode === 'HP');
  assert.ok(hpSlot, 'HP slot should exist');
  assert.equal(hpSlot.prescription.loadConvention, 'MACHINE_DISPLAY');
});
