-- Migration: 20261018140000_program_catalog_versions
-- Purpose: Add versioned program catalog support — families, editorial status,
--          session formats, slot options, substitution rules, profile snapshots,
--          matching decisions, and extended user-program fields.
-- Strategy: ADDITIVE ONLY — no existing columns dropped or altered.

-- ─────────────────────────── NEW ENUMS ───────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "GymbroEditorialStatus" AS ENUM (
        'DRAFT', 'COACH_REVIEW', 'VALIDATED', 'PUBLISHED', 'RETIRED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroProgressStatus" AS ENUM (
        'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCUSED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroAvailability" AS ENUM (
        'AVAILABLE', 'LOCKED_PREREQUISITE', 'LOCKED_SCHEDULE',
        'BLOCKED_SAFETY', 'BLOCKED_ENTITLEMENT', 'READ_ONLY'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroLoadConvention" AS ENUM (
        'TOTAL_EXTERNAL', 'PER_DUMBBELL', 'MACHINE_DISPLAY',
        'ADDED_PLATES', 'ASSISTANCE', 'BAND_SETUP', 'BODYWEIGHT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroEffortRating" AS ENUM (
        'EASY', 'AS_EXPECTED', 'HARD'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSessionFormat" AS ENUM (
        'STANDARD', 'CIRCUIT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSlotGrade" AS ENUM (
        'PRIMARY', 'A1', 'A2', 'A3'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSlotRole" AS ENUM (
        'MAIN', 'ACCESSORY', 'WARMUP', 'COOLDOWN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroExerciseMetric" AS ENUM (
        'REPS', 'DURATION', 'DISTANCE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroReviewStatus" AS ENUM (
        'NEEDS_REVIEW', 'VALIDATED', 'REJECTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroMatchStatusV2" AS ENUM (
        'MATCHED', 'NEEDS_CLARIFICATION', 'NEEDS_COACH_REVIEW',
        'NEEDS_MEDICAL_REVIEW', 'NO_COVERAGE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSubstitutionReason" AS ENUM (
        'ABSENT', 'BROKEN', 'BUSY', 'UNKNOWN', 'DISLIKED', 'PAIN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_program_families ─────────────────────────

CREATE TABLE IF NOT EXISTS "gymbro_program_families" (
    "id"                  TEXT        NOT NULL,
    "familyCode"          TEXT        NOT NULL,
    "goalCoverage"        TEXT[]      NOT NULL DEFAULT '{}',
    "prescriptionPolicy"  TEXT        NOT NULL,
    "progressionPolicy"   TEXT        NOT NULL,
    "maxSessionMinutes"   INTEGER     NOT NULL,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_program_families_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_program_families_familyCode_key"
    ON "gymbro_program_families"("familyCode");

-- ─────────────────────────── gymbro_programs — new nullable columns ──────────

ALTER TABLE "gymbro_programs"
    ADD COLUMN IF NOT EXISTS "familyId"           TEXT,
    ADD COLUMN IF NOT EXISTS "versionCode"         TEXT,
    ADD COLUMN IF NOT EXISTS "editorialStatus"     "GymbroEditorialStatus",
    ADD COLUMN IF NOT EXISTS "checksum"            TEXT,
    ADD COLUMN IF NOT EXISTS "prescriptionPolicy"  TEXT,
    ADD COLUMN IF NOT EXISTS "progressionPolicy"   TEXT,
    ADD COLUMN IF NOT EXISTS "maxSessionMinutes"   INTEGER,
    ADD COLUMN IF NOT EXISTS "reviewedAt"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reviewAuthor"        TEXT,
    ADD COLUMN IF NOT EXISTS "publishedAt"         TIMESTAMP(3);

-- versionCode unique (nullable — NULLs are not considered equal in PostgreSQL unique indexes)
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_programs_versionCode_key"
    ON "gymbro_programs"("versionCode")
    WHERE "versionCode" IS NOT NULL;

-- FK: gymbro_programs.familyId → gymbro_program_families.id
DO $$ BEGIN
    ALTER TABLE "gymbro_programs"
        ADD CONSTRAINT "gymbro_programs_familyId_fkey"
        FOREIGN KEY ("familyId") REFERENCES "gymbro_program_families"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_program_sessions — new nullable columns ──

ALTER TABLE "gymbro_program_sessions"
    ADD COLUMN IF NOT EXISTS "blueprintCode"          TEXT,
    ADD COLUMN IF NOT EXISTS "occurrenceCode"         TEXT,
    ADD COLUMN IF NOT EXISTS "sessionFormat"          "GymbroSessionFormat" NOT NULL DEFAULT 'STANDARD',
    ADD COLUMN IF NOT EXISTS "rounds"                 INTEGER,
    ADD COLUMN IF NOT EXISTS "betweenExerciseRestSec" INTEGER,
    ADD COLUMN IF NOT EXISTS "betweenRoundRestSec"    INTEGER,
    ADD COLUMN IF NOT EXISTS "estimatedSeconds"       INTEGER,
    ADD COLUMN IF NOT EXISTS "measuredSeconds"        INTEGER;

-- ─────────────────────────── gymbro_session_exercises — new nullable columns ─

ALTER TABLE "gymbro_session_exercises"
    ADD COLUMN IF NOT EXISTS "slotCode"          TEXT,
    ADD COLUMN IF NOT EXISTS "slotRole"          "GymbroSlotRole",
    ADD COLUMN IF NOT EXISTS "metric"            "GymbroExerciseMetric",
    ADD COLUMN IF NOT EXISTS "workingSets"       INTEGER,
    ADD COLUMN IF NOT EXISTS "repsMin2"          INTEGER,
    ADD COLUMN IF NOT EXISTS "repsMax2"          INTEGER,
    ADD COLUMN IF NOT EXISTS "durationMinSec"    INTEGER,
    ADD COLUMN IF NOT EXISTS "durationMaxSec"    INTEGER,
    ADD COLUMN IF NOT EXISTS "distanceMinM"      INTEGER,
    ADD COLUMN IF NOT EXISTS "distanceMaxM"      INTEGER,
    ADD COLUMN IF NOT EXISTS "targetRirMin"      INTEGER,
    ADD COLUMN IF NOT EXISTS "targetRirMax"      INTEGER,
    ADD COLUMN IF NOT EXISTS "restTargetSec"     INTEGER,
    ADD COLUMN IF NOT EXISTS "restAllowedMaxSec" INTEGER,
    ADD COLUMN IF NOT EXISTS "loadConvention"    "GymbroLoadConvention",
    ADD COLUMN IF NOT EXISTS "initialLoadKg"     DECIMAL(10,3),
    ADD COLUMN IF NOT EXISTS "required"          BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────── gymbro_program_slot_options ─────────────────────

CREATE TABLE IF NOT EXISTS "gymbro_program_slot_options" (
    "id"                   TEXT    NOT NULL,
    "sessionExerciseId"    TEXT    NOT NULL,
    "exerciseId"           TEXT    NOT NULL,
    "grade"                "GymbroSlotGrade" NOT NULL DEFAULT 'PRIMARY',
    "priority"             INTEGER NOT NULL,
    "approved"             BOOLEAN NOT NULL DEFAULT false,
    "prescriptionOverride" JSONB,
    CONSTRAINT "gymbro_program_slot_options_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_program_slot_options_sessionExerciseId_idx"
    ON "gymbro_program_slot_options"("sessionExerciseId");
CREATE INDEX IF NOT EXISTS "gymbro_program_slot_options_exerciseId_idx"
    ON "gymbro_program_slot_options"("exerciseId");

DO $$ BEGIN
    ALTER TABLE "gymbro_program_slot_options"
        ADD CONSTRAINT "gymbro_program_slot_options_sessionExerciseId_fkey"
        FOREIGN KEY ("sessionExerciseId") REFERENCES "gymbro_session_exercises"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "gymbro_program_slot_options"
        ADD CONSTRAINT "gymbro_program_slot_options_exerciseId_fkey"
        FOREIGN KEY ("exerciseId") REFERENCES "gymbro_exercises"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_exercise_substitution_rules ──────────────

CREATE TABLE IF NOT EXISTS "gymbro_exercise_substitution_rules" (
    "id"               TEXT               NOT NULL,
    "fromExerciseId"   TEXT               NOT NULL,
    "toExerciseId"     TEXT               NOT NULL,
    "grade"            "GymbroSlotGrade"  NOT NULL,
    "reason"           "GymbroSubstitutionReason",
    "conditions"       JSONB,
    "recalibrateLoad"  BOOLEAN            NOT NULL DEFAULT false,
    "reviewStatus"     "GymbroReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "reviewedAt"       TIMESTAMP(3),
    "reviewAuthor"     TEXT,
    "createdAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_exercise_substitution_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_exercise_substitution_rules_from_to_grade_key"
    ON "gymbro_exercise_substitution_rules"("fromExerciseId", "toExerciseId", "grade");
CREATE INDEX IF NOT EXISTS "gymbro_exercise_substitution_rules_fromExerciseId_idx"
    ON "gymbro_exercise_substitution_rules"("fromExerciseId");

DO $$ BEGIN
    ALTER TABLE "gymbro_exercise_substitution_rules"
        ADD CONSTRAINT "gymbro_exercise_substitution_rules_fromExerciseId_fkey"
        FOREIGN KEY ("fromExerciseId") REFERENCES "gymbro_exercises"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "gymbro_exercise_substitution_rules"
        ADD CONSTRAINT "gymbro_exercise_substitution_rules_toExerciseId_fkey"
        FOREIGN KEY ("toExerciseId") REFERENCES "gymbro_exercises"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_profile_snapshots ────────────────────────

CREATE TABLE IF NOT EXISTS "gymbro_profile_snapshots" (
    "id"             TEXT                NOT NULL,
    "userId"         TEXT                NOT NULL,
    "schemaVersion"  TEXT                NOT NULL,
    "revision"       INTEGER             NOT NULL,
    "normalizedJson" JSONB               NOT NULL,
    "safetyStatus"   "GymbroMatchStatusV2" NOT NULL,
    "createdAt"      TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_profile_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_profile_snapshots_userId_idx"
    ON "gymbro_profile_snapshots"("userId");

DO $$ BEGIN
    ALTER TABLE "gymbro_profile_snapshots"
        ADD CONSTRAINT "gymbro_profile_snapshots_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_matching_decisions ───────────────────────

CREATE TABLE IF NOT EXISTS "gymbro_matching_decisions" (
    "id"                TEXT                NOT NULL,
    "profileSnapshotId" TEXT                NOT NULL,
    "status"            "GymbroMatchStatusV2" NOT NULL,
    "score"             INTEGER,
    "versionCode"       TEXT,
    "reasonCodesJson"   TEXT[]              NOT NULL DEFAULT '{}',
    "rulesVersion"      TEXT                NOT NULL,
    "decidedAt"         TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_matching_decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_matching_decisions_profileSnapshotId_idx"
    ON "gymbro_matching_decisions"("profileSnapshotId");

DO $$ BEGIN
    ALTER TABLE "gymbro_matching_decisions"
        ADD CONSTRAINT "gymbro_matching_decisions_profileSnapshotId_fkey"
        FOREIGN KEY ("profileSnapshotId") REFERENCES "gymbro_profile_snapshots"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_user_programs — new nullable columns ─────

ALTER TABLE "gymbro_user_programs"
    ADD COLUMN IF NOT EXISTS "profileSnapshotId"     TEXT,
    ADD COLUMN IF NOT EXISTS "matchingDecisionId"     TEXT,
    ADD COLUMN IF NOT EXISTS "assignmentRevision"     INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "calendarPolicy"         TEXT,
    ADD COLUMN IF NOT EXISTS "inventorySnapshotJson"  JSONB;

-- matchingDecisionId is unique (one userProgram per decision)
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_user_programs_matchingDecisionId_key"
    ON "gymbro_user_programs"("matchingDecisionId")
    WHERE "matchingDecisionId" IS NOT NULL;

DO $$ BEGIN
    ALTER TABLE "gymbro_user_programs"
        ADD CONSTRAINT "gymbro_user_programs_profileSnapshotId_fkey"
        FOREIGN KEY ("profileSnapshotId") REFERENCES "gymbro_profile_snapshots"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "gymbro_user_programs"
        ADD CONSTRAINT "gymbro_user_programs_matchingDecisionId_fkey"
        FOREIGN KEY ("matchingDecisionId") REFERENCES "gymbro_matching_decisions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
