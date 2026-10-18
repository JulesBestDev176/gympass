# Program Catalog — Operator Guide

## Test Database

All program catalog integration tests run against a disposable Docker container.
Docker must be installed and the daemon must be running before any command below.

```bash
# Start the test database (PostgreSQL 16, port 15440)
node scripts/program_test_database.cjs start

# Run the integration tests
node scripts/program_test_database.cjs test

# Tear down the container and remove the password secret
node scripts/program_test_database.cjs stop
```

The container is named `gymbro-programs-test`.
The database is `gymbro_program_test`, user `gymbro_test`.
A random password is generated on first `start` and stored in `/tmp/gymbro-test-db.secret`.
That file is never committed — add it to `.gitignore` if not already present.

To reset the database, run `stop` then `start`.

---

## Migration Batches

### Batch 1 — `20261018140000_program_catalog_versions`

Adds editorial and versioning metadata to the program catalog:

- **13 new enums** — `GymbroEditorialStatus`, `GymbroProgressStatus`,
  `GymbroAvailability`, `GymbroLoadConvention`, `GymbroEffortRating`,
  `GymbroSessionFormat`, `GymbroSlotGrade`, `GymbroSlotRole`,
  `GymbroExerciseMetric`, `GymbroReviewStatus`, `GymbroMatchStatusV2`,
  `GymbroSubstitutionReason`.
- **`gymbro_program_families`** — editorial family registry (P01–P37).
- **`gymbro_programs`** — 10 nullable columns: `familyId`, `versionCode`
  (partial unique index), `editorialStatus`, `checksum`, policies, dates.
- **`gymbro_program_sessions`** — session format, blueprint/occurrence codes,
  rest periods, timing estimates.
- **`gymbro_session_exercises`** — slot metadata, load convention, Decimal load.
- **`gymbro_program_slot_options`** — alternative exercise slots per session exercise.
- **`gymbro_exercise_substitution_rules`** — approved substitution graph.
- **`gymbro_profile_snapshots`** — immutable normalized profile snapshots.
- **`gymbro_matching_decisions`** — program matching audit trail.
- **`gymbro_user_programs`** — 5 new nullable/defaulted columns linking to
  snapshot and decision.

### Batch 2 — `20261018141000_program_assignments_progression`

Adds execution tracking:

- **`gymbro_progression_nodes`** — ordered workout node graph per assignment.
- **`gymbro_assignment_exercises`** — resolved exercise per slot per assignment.
- **`gymbro_user_sessions`** — links to progression node, effort rating, pain flag.
- **`gymbro_user_sets`** — RIR tracking, Decimal load, effort rating.
- **`gymbro_program_adjustments`** — before/after JSON audit columns.
- **Partial unique index** `gymbro_one_active_program_per_user` on
  `gymbro_user_programs ("userId") WHERE actif = true`.

---

## Key Constraints

| Constraint | Details |
|---|---|
| One active program per user | Partial unique index on `gymbro_user_programs("userId") WHERE actif = true`. Set `actif = false` on the old program before creating a new active one. |
| Node sequence uniqueness | `UNIQUE (userProgramId, sequence)` — sequence numbers 1-based, no gaps required but no duplicates per assignment. |
| Node occurrence uniqueness | `UNIQUE (userProgramId, occurrenceCode)` — each blueprint occurrence appears once per assignment. |
| versionCode uniqueness | Partial unique index on non-NULL `versionCode` in `gymbro_programs`. Multiple rows may have NULL. |
| Assignment exercise uniqueness | `UNIQUE (userProgramId, sessionExerciseId)` — one resolved exercise per slot per assignment. |

---

## Applying Migrations to Production

```bash
# Validate schema first
npx prisma validate

# Apply via Prisma (uses migration history)
npx prisma migrate deploy

# Or apply SQL manually in order:
psql $DATABASE_URL -f prisma/migrations/20261018140000_program_catalog_versions/migration.sql
psql $DATABASE_URL -f prisma/migrations/20261018141000_program_assignments_progression/migration.sql
```

All new columns on existing tables are nullable or have defaults — no data loss,
no lock escalation beyond standard `ALTER TABLE … ADD COLUMN`.
