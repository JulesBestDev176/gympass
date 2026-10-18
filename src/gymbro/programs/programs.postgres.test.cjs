// programs.postgres.test.cjs
// Integration tests against a real PostgreSQL instance.
// Run via: node scripts/program_test_database.cjs test
// Requires PROGRAMS_TEST_DATABASE_URL env var pointing to the test DB.

require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const testUrl = process.env.PROGRAMS_TEST_DATABASE_URL;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Run all statements from a migration file in order. */
async function applyMigration(db, migrationRelPath) {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../../', migrationRelPath),
    'utf8',
  );
  // Split on semicolons but keep DO $$ ... $$ blocks intact
  const stmts = splitSql(sql);
  for (const stmt of stmts) {
    if (stmt.trim()) await db.$executeRawUnsafe(stmt);
  }
}

/** Naive SQL splitter that respects $$ dollar-quoting. */
function splitSql(sql) {
  const result = [];
  let current = '';
  let inDollarQuote = false;
  const lines = sql.split('\n');
  for (const line of lines) {
    current += line + '\n';
    const count = (current.match(/\$\$/g) || []).length;
    if (count % 2 === 0 && !inDollarQuote) {
      // we are outside dollar quotes — split on semicolons
      const parts = current.split(';');
      for (let i = 0; i < parts.length - 1; i++) {
        result.push(parts[i]);
      }
      current = parts[parts.length - 1];
    }
  }
  if (current.trim()) result.push(current);
  return result;
}

/** Unique short id for test isolation */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── guard: must point at test DB (port 15440) ────────────────────────────────

if (!testUrl) {
  console.error('PROGRAMS_TEST_DATABASE_URL is not set. Run via: node scripts/program_test_database.cjs test');
  process.exit(1);
}

(() => {
  const u = new URL(testUrl);
  if (u.port !== '15440') {
    console.error(`Safety guard: expected port 15440, got ${u.port}. Refusing to run on a non-test database.`);
    process.exit(1);
  }
})();

// ─── Test suite ───────────────────────────────────────────────────────────────

test('programs schema — full PostgreSQL integration', async (t) => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  t.after(() => db.$disconnect());

  // ── Bootstrap: apply the legacy gymbro models migration from scratch ────────
  // Drop tables in reverse dependency order to start clean each run.
  const drops = [
    'gymbro_assignment_exercises',
    'gymbro_progression_nodes',
    'gymbro_program_adjustments',
    'gymbro_user_sets',
    'gymbro_user_sessions',
    'gymbro_user_programs',
    'gymbro_matching_decisions',
    'gymbro_profile_snapshots',
    'gymbro_program_slot_options',
    'gymbro_exercise_substitution_rules',
    'gymbro_session_exercises',
    'gymbro_program_sessions',
    'gymbro_program_weeks',
    'gymbro_program_phases',
    'gymbro_programs',
    'gymbro_program_families',
    'gymbro_exercises',
    'gymbro_bilans',
    'gymbro_photos',
    'gymbro_weight_logs',
    'gymbro_subscriptions',
    'gymbro_notifications',
    'gymbro_user_profiles',
    'gymbro_users',
  ];

  // Drop enum types that might exist from a prior run
  const enumsToDrop = [
    'GymbroEditorialStatus',
    'GymbroProgressStatus',
    'GymbroAvailability',
    'GymbroLoadConvention',
    'GymbroEffortRating',
    'GymbroSessionFormat',
    'GymbroSlotGrade',
    'GymbroSlotRole',
    'GymbroExerciseMetric',
    'GymbroReviewStatus',
    'GymbroMatchStatusV2',
    'GymbroSubstitutionReason',
    // legacy enums
    'GymbroObjectif',
    'GymbroNiveau',
    'GymbroTypeEquipement',
    'GymbroPreferenceEquipement',
    'GymbroSubscriptionStatus',
    'GymbroMatchingStatus',
    'GymbroSessionStatus',
    'GymbroSetStatus',
    'GymbroPhotoAngle',
    'GymbroRole',
  ];

  for (const t of drops) {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`);
  }
  for (const e of enumsToDrop) {
    await db.$executeRawUnsafe(`DROP TYPE IF EXISTS "${e}" CASCADE`);
  }

  // Apply migrations in order
  await applyMigration(db, 'prisma/migrations/20261015000000_add_gymbro_models/migration.sql');
  // Apply role + otp migrations that add columns
  await applyMigration(db, 'prisma/migrations/20261017000001_add_gymbro_role/migration.sql');
  await applyMigration(db, 'prisma/migrations/20261017150000_gymbro_phone_otp/migration.sql');
  await applyMigration(db, 'prisma/migrations/20261018000000_gymbro_phone_otp_ensure_columns/migration.sql');
  // Task 2 migrations
  await applyMigration(db, 'prisma/migrations/20261018140000_program_catalog_versions/migration.sql');
  await applyMigration(db, 'prisma/migrations/20261018141000_program_assignments_progression/migration.sql');

  // ── Seed a minimal user + program for FK-dependent tests ───────────────────
  const userId = `u-${uid()}`;
  await db.$executeRawUnsafe(
    `INSERT INTO "gymbro_users" ("id","email","passwordHash","prenom","nom","updatedAt")
     VALUES ($1,$2,'hash','Test','User',CURRENT_TIMESTAMP)`,
    userId, `test-${uid()}@example.com`,
  );

  const programId = `p-${uid()}`;
  await db.$executeRawUnsafe(
    `INSERT INTO "gymbro_programs" ("id","nom","objectif","niveauMin","niveauMax","seancesParSemaine","dureeSeanceMin","updatedAt")
     VALUES ($1,'Legacy Program','FORCE','DEBUTANT','DEBUTANT',3,60,CURRENT_TIMESTAMP)`,
    programId,
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: Legacy GymbroUserProgram created without new fields still readable
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('legacy GymbroUserProgram record survives migration intact', async () => {
    const upId = `up-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_user_programs" ("id","userId","programId","updatedAt")
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
      upId, userId, programId,
    );

    const row = await db.gymbroUserProgram.findUniqueOrThrow({ where: { id: upId } });
    assert.equal(row.id, upId);
    assert.equal(row.actif, true);          // legacy default preserved
    assert.equal(row.version, 1);           // legacy default preserved
    assert.equal(row.assignmentRevision, 1); // new column default
    assert.equal(row.profileSnapshotId, null);
    assert.equal(row.matchingDecisionId, null);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Partial unique index — only 1 active program per user
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('partial unique index allows only one active program per user', async () => {
    const u2Id = `u2-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_users" ("id","email","passwordHash","prenom","nom","updatedAt")
       VALUES ($1,$2,'hash','Alice','Test',CURRENT_TIMESTAMP)`,
      u2Id, `alice-${uid()}@example.com`,
    );

    // First active program — must succeed
    const up1Id = `up1-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_user_programs" ("id","userId","programId","actif","updatedAt")
       VALUES ($1,$2,$3,true,CURRENT_TIMESTAMP)`,
      up1Id, u2Id, programId,
    );

    // Second concurrent active program for same user — must fail
    const up2Id = `up2-${uid()}`;
    await assert.rejects(
      () => db.$executeRawUnsafe(
        `INSERT INTO "gymbro_user_programs" ("id","userId","programId","actif","updatedAt")
         VALUES ($1,$2,$3,true,CURRENT_TIMESTAMP)`,
        up2Id, u2Id, programId,
      ),
      (err) => {
        // PostgreSQL unique violation = error code 23505
        assert.ok(
          err.message.includes('unique') ||
          err.message.includes('gymbro_one_active_program_per_user') ||
          (err.code === 'P2010') || // Prisma raw query unique violation
          err.message.includes('23505'),
          `Expected unique violation, got: ${err.message}`,
        );
        return true;
      },
    );

    // Inactive program for same user — must succeed
    const up3Id = `up3-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_user_programs" ("id","userId","programId","actif","updatedAt")
       VALUES ($1,$2,$3,false,CURRENT_TIMESTAMP)`,
      up3Id, u2Id, programId,
    );
    const inactive = await db.gymbroUserProgram.findUniqueOrThrow({ where: { id: up3Id } });
    assert.equal(inactive.actif, false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: GymbroProgressionNode with NOT_STARTED links to GymbroUserProgram
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('GymbroProgressionNode NOT_STARTED links correctly to GymbroUserProgram', async () => {
    const upId = `up-node-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_user_programs" ("id","userId","programId","actif","updatedAt")
       VALUES ($1,$2,$3,true,CURRENT_TIMESTAMP)`,
      upId, userId, programId,
    );

    const nodeId = `node-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_progression_nodes"
         ("id","userProgramId","occurrenceCode","sequence","weekNumber","phaseNumber","title","updatedAt")
       VALUES ($1,$2,$3,1,1,1,'W1 Session A',CURRENT_TIMESTAMP)`,
      nodeId, upId, `OCC-${uid()}`,
    );

    const node = await db.gymbroProgressionNode.findUniqueOrThrow({ where: { id: nodeId } });
    assert.equal(node.progressStatus, 'NOT_STARTED');
    assert.equal(node.availability, 'LOCKED_PREREQUISITE');
    assert.equal(node.userProgramId, upId);
    assert.equal(node.userSession, undefined); // no session yet
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: GymbroProgramFamily familyCode='P01' can be created and queried
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test("GymbroProgramFamily 'P01' can be created and queried", async () => {
    const famId = `fam-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_program_families"
         ("id","familyCode","goalCoverage","prescriptionPolicy","progressionPolicy","maxSessionMinutes","updatedAt")
       VALUES ($1,'P01',ARRAY['PRISE_DE_MASSE','FORCE'],'linear','auto',75,CURRENT_TIMESTAMP)`,
      famId,
    );

    const fam = await db.gymbroProgramFamily.findUniqueOrThrow({ where: { familyCode: 'P01' } });
    assert.equal(fam.familyCode, 'P01');
    assert.deepEqual(fam.goalCoverage, ['PRISE_DE_MASSE', 'FORCE']);
    assert.equal(fam.maxSessionMinutes, 75);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: GymbroProgram.versionCode must be unique (insert same twice → error)
  // ─────────────────────────────────────────────────────────────────────────────
  await t.test('GymbroProgram.versionCode unique constraint prevents duplicates', async () => {
    const vc = `P01-L-${uid()}`;

    const p1Id = `prog1-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_programs"
         ("id","nom","objectif","niveauMin","niveauMax","seancesParSemaine","dureeSeanceMin","versionCode","updatedAt")
       VALUES ($1,'Program V1','FORCE','DEBUTANT','DEBUTANT',3,60,$2,CURRENT_TIMESTAMP)`,
      p1Id, vc,
    );

    // Attempt to insert second program with same versionCode
    const p2Id = `prog2-${uid()}`;
    await assert.rejects(
      () => db.$executeRawUnsafe(
        `INSERT INTO "gymbro_programs"
           ("id","nom","objectif","niveauMin","niveauMax","seancesParSemaine","dureeSeanceMin","versionCode","updatedAt")
         VALUES ($1,'Program V1 Duplicate','FORCE','DEBUTANT','DEBUTANT',3,60,$2,CURRENT_TIMESTAMP)`,
        p2Id, vc,
      ),
      (err) => {
        assert.ok(
          err.message.includes('unique') ||
          err.message.includes('versionCode') ||
          err.message.includes('23505'),
          `Expected unique violation for versionCode, got: ${err.message}`,
        );
        return true;
      },
    );

    // NULL versionCode is allowed multiple times (NULLs don't violate unique)
    const p3Id = `prog3-${uid()}`;
    const p4Id = `prog4-${uid()}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_programs"
         ("id","nom","objectif","niveauMin","niveauMax","seancesParSemaine","dureeSeanceMin","updatedAt")
       VALUES ($1,'Null VC 1','FORCE','DEBUTANT','DEBUTANT',3,60,CURRENT_TIMESTAMP)`,
      p3Id,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "gymbro_programs"
         ("id","nom","objectif","niveauMin","niveauMax","seancesParSemaine","dureeSeanceMin","updatedAt")
       VALUES ($1,'Null VC 2','FORCE','DEBUTANT','DEBUTANT',3,60,CURRENT_TIMESTAMP)`,
      p4Id,
    );
    const p3 = await db.gymbroProgram.findUniqueOrThrow({ where: { id: p3Id } });
    assert.equal(p3.versionCode, null);
  });
});
