// ─────────────────────────── PROGRAM IMPORT TESTS ────────────────────────────
// Uses Node.js built-in test runner + an in-memory Prisma mock.
// No real database is needed.

require('ts-node/register/transpile-only');

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ─────────────────────────── MINIMAL VALID MANIFEST ──────────────────────────
// Uses the established ProgramManifest format: schemaVersion, familyCode, versionCode,
// durationWeeks: 12, and exactly 12 weeks with sessions.

function buildSession(weekNum, sessionNum) {
  return {
    occurrenceCode: `P99-L-v1-W${weekNum}-S${sessionNum}`,
    blueprintCode: 'D-A',
    sessionNumber: sessionNum,
    format: 'STANDARD',
    slots: [],
    rounds: null,
    betweenExerciseRestSeconds: null,
    betweenRoundRestSeconds: null,
    estimatedSeconds: 2700,
    measuredSeconds: null,
  };
}

function buildWeek(weekNum) {
  return {
    weekNumber: weekNum,
    phaseNumber: weekNum <= 4 ? 1 : weekNum <= 8 ? 2 : 3,
    sessions: [buildSession(weekNum, 1), buildSession(weekNum, 2), buildSession(weekNum, 3)],
  };
}

function buildManifest(overrides = {}) {
  return {
    schemaVersion: 'gymbro-program-catalog/1',
    familyCode: 'P99',
    versionCode: 'P99-L-v1',
    status: 'DRAFT',
    durationWeeks: 12,
    goalCoverage: ['REMISE_EN_FORME'],
    prescriptionPolicy: 'double-progression',
    progressionPolicy: 'reps-then-load',
    maxSessionMinutes: 60,
    weeks: Array.from({length: 12}, (_, i) => buildWeek(i + 1)),
    ...overrides,
  };
}

// ─────────────────────────── PRISMA MOCK BUILDER ─────────────────────────────
// The mock stores state in-memory so we can test idempotency and conflict logic.

function buildPrismaMock(initialPrograms = []) {
  let programs = [...initialPrograms];
  let families = [];
  let phases = [];
  let weeks = [];
  let sessions = [];
  let exercises = [];
  let nextId = 1000;

  const genId = () => `mock-id-${nextId++}`;

  const mock = {
    gymbroProgramFamily: {
      upsert: async ({ where, create, update }) => {
        const existing = families.find((f) => f.familyCode === where.familyCode);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const f = { id: genId(), ...create };
        families.push(f);
        return f;
      },
    },
    gymbroProgram: {
      findUnique: async ({ where, select }) => {
        const p = where.versionCode
          ? programs.find((p) => p.versionCode === where.versionCode)
          : programs.find((p) => p.id === where.id);
        if (!p) return null;
        if (!select) return p;
        const result = {};
        for (const key of Object.keys(select)) {
          result[key] = p[key];
        }
        return result;
      },
      create: async ({ data }) => {
        const p = { id: genId(), ...data };
        programs.push(p);
        return p;
      },
      update: async ({ where, data }) => {
        const p = programs.find((p) => p.id === where.id);
        if (!p) throw new Error('Program not found');
        Object.assign(p, data);
        return p;
      },
    },
    gymbroProgramPhase: {
      findMany: async ({ where }) => phases.filter((p) => p.programId === where.programId),
      create: async ({ data }) => {
        const ph = { id: genId(), ...data };
        phases.push(ph);
        return ph;
      },
      deleteMany: async ({ where }) => {
        phases = phases.filter((p) => p.programId !== where.programId);
        return {};
      },
    },
    gymbroProgramWeek: {
      findMany: async ({ where }) => weeks.filter((w) => w.phaseId === where.phaseId),
      create: async ({ data }) => {
        const w = { id: genId(), ...data };
        weeks.push(w);
        return w;
      },
      deleteMany: async ({ where }) => {
        weeks = weeks.filter((w) => w.phaseId !== where.phaseId);
        return {};
      },
    },
    gymbroProgramSession: {
      findMany: async ({ where }) => sessions.filter((s) => s.weekId === where.weekId),
      create: async ({ data }) => {
        const s = { id: genId(), ...data };
        sessions.push(s);
        return s;
      },
      deleteMany: async ({ where }) => {
        sessions = sessions.filter((s) => s.weekId !== where.weekId);
        return {};
      },
    },
    gymbroSessionExercise: {
      create: async ({ data }) => {
        const e = { id: genId(), ...data };
        exercises.push(e);
        return e;
      },
      deleteMany: async ({ where }) => {
        exercises = exercises.filter((e) => e.sessionId !== where.sessionId);
        return {};
      },
    },
    // $transaction: execute the callback with the mock itself as the "tx"
    $transaction: async (fn) => fn(mock),
    // Expose internal state for assertions
    _state: () => ({ programs, families, phases, weeks, sessions, exercises }),
  };

  return mock;
}

// ─────────────────────────── LOAD SERVICE ─────────────────────────────────────

function buildService(prismaMock) {
  const { ProgramImportService } = require('./program-import.service');
  return new ProgramImportService(prismaMock);
}

// ─────────────────────────── TEST 1: IDEMPOTENT REIMPORT ──────────────────────

test('Idempotent reimport — second call returns {created: false}', async () => {
  const mock = buildPrismaMock();
  const svc = buildService(mock);
  const manifest = buildManifest();

  const r1 = await svc.importDraft(manifest);
  assert.equal(r1.created, true, 'first import must create');

  const r2 = await svc.importDraft(manifest);
  assert.equal(r2.created, false, 'second import must NOT create a duplicate');
  assert.equal(r2.id, r1.id, 'second import must return the same id');

  const state = mock._state();
  assert.equal(state.programs.length, 1, 'only one program row must exist');
});

// ─────────────────────────── TEST 2: STATUS FORCED TO DRAFT ───────────────────

test('Status forced to DRAFT — even if manifest.status is PUBLISHED', async () => {
  const mock = buildPrismaMock();
  const svc = buildService(mock);
  const manifest = buildManifest({ status: 'PUBLISHED' });

  const { id } = await svc.importDraft(manifest);

  const state = mock._state();
  const program = state.programs.find((p) => p.id === id);
  assert.ok(program, 'program must exist');
  assert.equal(program.editorialStatus, 'DRAFT', 'editorialStatus must be forced to DRAFT');
});

// ─────────────────────────── TEST 3: ROLLBACK ON FAMILY UPSERT FAILURE ────────

test('Rollback on missing family — no GymbroProgram row created if upsert throws', async () => {
  const mock = buildPrismaMock();

  // Inject a failure in the family upsert
  mock.gymbroProgramFamily.upsert = async () => {
    throw new Error('Simulated DB error in family upsert');
  };

  const svc = buildService(mock);
  const manifest = buildManifest({ familyCode: 'P99' });

  await assert.rejects(
    () => svc.importDraft(manifest),
    /Simulated DB error/,
    'must propagate the family upsert error',
  );

  const state = mock._state();
  assert.equal(state.programs.length, 0, 'no program row must have been created');
});

// ─────────────────────────── TEST 4: CHECKSUM CONFLICT ON PUBLISHED ───────────

test('Checksum conflict on published version — throws 409', async () => {
  // Simulate an existing PUBLISHED program with a different checksum
  const existingProgram = {
    id: 'existing-pub-id',
    versionCode: 'P99-L-v1',
    checksum: 'old-checksum-abc123',
    editorialStatus: 'PUBLISHED',
  };

  const mock = buildPrismaMock([existingProgram]);
  const svc = buildService(mock);

  // The new manifest will have a different checksum (different goalCoverage)
  const manifest = buildManifest({ goalCoverage: ['FORCE'] });

  await assert.rejects(
    async () => svc.importDraft(manifest),
    (err) => {
      // ConflictException from NestJS has status 409
      assert.ok(err.message.includes('Checksum conflict') || err.status === 409,
        `expected ConflictException, got: ${err.message}`);
      return true;
    },
    'must throw ConflictException for published version with different checksum',
  );

  const state = mock._state();
  assert.equal(state.programs.length, 1, 'must not create a new program row');
  assert.equal(state.programs[0].checksum, 'old-checksum-abc123', 'existing checksum must be unchanged');
});

// ─────────────────────────── TEST 5: DRY RUN ──────────────────────────────────

test('dryRun returns ValidationReport without writing to DB', async () => {
  const mock = buildPrismaMock();
  const svc = buildService(mock);
  const manifest = buildManifest();

  const report = await svc.dryRun(manifest);

  assert.equal(report.valid, true, 'valid manifest must yield report.valid === true');
  assert.ok(typeof report.checksum === 'string' && report.checksum.length > 0,
    'checksum must be a non-empty string');

  const state = mock._state();
  assert.equal(state.programs.length, 0, 'dryRun must not write any program rows');
  assert.equal(state.families.length, 0, 'dryRun must not write any family rows');
});
