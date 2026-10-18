-- Migration: 20261018141000_program_assignments_progression
-- Purpose: Add progression nodes, assignment exercises, extend sessions/sets/
--          adjustments with effort tracking, and enforce one-active-program-
--          per-user partial unique index.
-- Strategy: ADDITIVE ONLY — no existing columns dropped or altered.

-- ─────────────────────────── gymbro_progression_nodes ────────────────────────

CREATE TABLE IF NOT EXISTS "gymbro_progression_nodes" (
    "id"                TEXT                   NOT NULL,
    "userProgramId"     TEXT                   NOT NULL,
    "occurrenceCode"    TEXT                   NOT NULL,
    "sequence"          INTEGER                NOT NULL,
    "weekNumber"        INTEGER                NOT NULL,
    "phaseNumber"       INTEGER                NOT NULL,
    "title"             TEXT                   NOT NULL,
    "prerequisiteNodeId" TEXT,
    "progressStatus"    "GymbroProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "availability"      "GymbroAvailability"   NOT NULL DEFAULT 'LOCKED_PREREQUISITE',
    "reasonCode"        TEXT,
    "reasonLabel"       TEXT,
    "scheduledAt"       TIMESTAMP(3),
    "availableAt"       TIMESTAMP(3),
    "startedAt"         TIMESTAMP(3),
    "completedAt"       TIMESTAMP(3),
    "excusedAt"         TIMESTAMP(3),
    "excuseAuthor"      TEXT,
    "excuseReason"      TEXT,
    "createdAt"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_progression_nodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_progression_nodes_userProgramId_sequence_key"
    ON "gymbro_progression_nodes"("userProgramId", "sequence");

CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_progression_nodes_userProgramId_occurrenceCode_key"
    ON "gymbro_progression_nodes"("userProgramId", "occurrenceCode");

CREATE INDEX IF NOT EXISTS "gymbro_progression_nodes_userProgramId_idx"
    ON "gymbro_progression_nodes"("userProgramId");

CREATE INDEX IF NOT EXISTS "gymbro_progression_nodes_prerequisiteNodeId_idx"
    ON "gymbro_progression_nodes"("prerequisiteNodeId");

DO $$ BEGIN
    ALTER TABLE "gymbro_progression_nodes"
        ADD CONSTRAINT "gymbro_progression_nodes_userProgramId_fkey"
        FOREIGN KEY ("userProgramId") REFERENCES "gymbro_user_programs"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "gymbro_progression_nodes"
        ADD CONSTRAINT "gymbro_progression_nodes_prerequisiteNodeId_fkey"
        FOREIGN KEY ("prerequisiteNodeId") REFERENCES "gymbro_progression_nodes"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_assignment_exercises ─────────────────────

CREATE TABLE IF NOT EXISTS "gymbro_assignment_exercises" (
    "id"                TEXT                   NOT NULL,
    "userProgramId"     TEXT                   NOT NULL,
    "sessionExerciseId" TEXT                   NOT NULL,
    "resolvedExerciseId" TEXT                  NOT NULL,
    "selectedGrade"     "GymbroSlotGrade"      NOT NULL DEFAULT 'PRIMARY',
    "equipmentId"       TEXT,
    "prescription"      JSONB                  NOT NULL,
    "loadConvention"    "GymbroLoadConvention" NOT NULL,
    "initialLoadKg"     DECIMAL(10,3),
    "bindingVersion"    TEXT,
    "createdAt"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_assignment_exercises_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_assignment_exercises_userProgramId_sessionExerciseId_key"
    ON "gymbro_assignment_exercises"("userProgramId", "sessionExerciseId");

CREATE INDEX IF NOT EXISTS "gymbro_assignment_exercises_userProgramId_idx"
    ON "gymbro_assignment_exercises"("userProgramId");

CREATE INDEX IF NOT EXISTS "gymbro_assignment_exercises_sessionExerciseId_idx"
    ON "gymbro_assignment_exercises"("sessionExerciseId");

DO $$ BEGIN
    ALTER TABLE "gymbro_assignment_exercises"
        ADD CONSTRAINT "gymbro_assignment_exercises_userProgramId_fkey"
        FOREIGN KEY ("userProgramId") REFERENCES "gymbro_user_programs"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "gymbro_assignment_exercises"
        ADD CONSTRAINT "gymbro_assignment_exercises_sessionExerciseId_fkey"
        FOREIGN KEY ("sessionExerciseId") REFERENCES "gymbro_session_exercises"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "gymbro_assignment_exercises"
        ADD CONSTRAINT "gymbro_assignment_exercises_resolvedExerciseId_fkey"
        FOREIGN KEY ("resolvedExerciseId") REFERENCES "gymbro_exercises"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_user_sessions — new columns ──────────────

ALTER TABLE "gymbro_user_sessions"
    ADD COLUMN IF NOT EXISTS "progressionNodeId"  TEXT,
    ADD COLUMN IF NOT EXISTS "effortRating"        "GymbroEffortRating",
    ADD COLUMN IF NOT EXISTS "interruptedForPain"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "actualSeconds"       INTEGER;

-- progressionNodeId is unique: one session per node
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_user_sessions_progressionNodeId_key"
    ON "gymbro_user_sessions"("progressionNodeId")
    WHERE "progressionNodeId" IS NOT NULL;

DO $$ BEGIN
    ALTER TABLE "gymbro_user_sessions"
        ADD CONSTRAINT "gymbro_user_sessions_progressionNodeId_fkey"
        FOREIGN KEY ("progressionNodeId") REFERENCES "gymbro_progression_nodes"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────── gymbro_user_sets — new columns ──────────────────

ALTER TABLE "gymbro_user_sets"
    ADD COLUMN IF NOT EXISTS "effortRating"    "GymbroEffortRating",
    ADD COLUMN IF NOT EXISTS "rirActual"       INTEGER,
    ADD COLUMN IF NOT EXISTS "loadKgDecimal"   DECIMAL(10,3),
    ADD COLUMN IF NOT EXISTS "loadConvention"  "GymbroLoadConvention";

-- ─────────────────────────── gymbro_program_adjustments — new columns ────────

ALTER TABLE "gymbro_program_adjustments"
    ADD COLUMN IF NOT EXISTS "actorId"            TEXT,
    ADD COLUMN IF NOT EXISTS "beforeJson"          JSONB,
    ADD COLUMN IF NOT EXISTS "afterJson"           JSONB,
    ADD COLUMN IF NOT EXISTS "adjustmentRevision"  INTEGER,
    ADD COLUMN IF NOT EXISTS "progressionNodeId"   TEXT;

-- ─────────────────────────── Partial unique index — one active program ────────

-- Detect duplicate active programs before creating the index
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT "userId", COUNT(*) AS cnt
        FROM "gymbro_user_programs"
        WHERE "actif" = true
        GROUP BY "userId"
        HAVING COUNT(*) > 1
    ) dupes;

    IF dup_count > 0 THEN
        RAISE NOTICE 'WARNING: % user(s) have multiple active programs. '
            'The partial unique index gymbro_one_active_program_per_user '
            'will NOT be created until duplicates are resolved. '
            'Run: SELECT "userId", COUNT(*) FROM gymbro_user_programs '
            'WHERE actif = true GROUP BY "userId" HAVING COUNT(*) > 1;',
            dup_count;
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_one_active_program_per_user"
            ON "gymbro_user_programs" ("userId")
            WHERE "actif" = true;
        RAISE NOTICE 'Partial unique index gymbro_one_active_program_per_user created successfully.';
    END IF;
END $$;
