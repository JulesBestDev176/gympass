# Program Catalog — Import Guide

## Overview

The program catalog is a set of compiled JSON manifests that define GymBro training programs. Each manifest describes a complete program including:

- Identity metadata (`versionCode`, `nom`, `objectif`, etc.)
- Session blueprints (reusable session templates with exercise slots)
- Week structure (which blueprint is used on each day of each week)
- Family information (optional grouping for related programs)

## Directory structure

```
assets/program-catalog/
  generated/           # Compiled manifest files (one per program)
    force-debutant-3j-v1.json
    masse-intermediaire-4j-v1.json
    ...
  families.json        # Family definitions
```

## Manifest format

```jsonc
{
  "versionCode": "force-debutant-3j-v1",
  "nom": "Force Débutant — 3 jours",
  "objectif": "FORCE",
  "niveauMin": "DEBUTANT",
  "niveauMax": "QUELQUES_MOIS",
  "seancesParSemaine": 3,
  "typeEquipement": "SALLE_COMPLETE",
  "dureeSeanceMin": 60,
  "nbSemaines": 12,

  // Optional family grouping
  "family": {
    "familyCode": "FAM-FORCE",
    "goalCoverage": ["FORCE"],
    "prescriptionPolicy": "linear",
    "progressionPolicy": "weekly_increment"
  },

  // Session blueprints (reusable templates)
  "blueprints": [
    {
      "blueprintCode": "BP-PUSH-A",
      "nom": "Push A",
      "sessionFormat": "STANDARD",
      "slots": [
        {
          "slotCode": "SLOT-BENCH",
          "slotRole": "MAIN",
          "ordre": 1,
          "nbSeries": 5,
          "repsMin": 5,
          "repsMax": 5,
          "options": [
            { "exerciseId": "<cuid>", "grade": "PRIMARY", "priority": 1, "approved": true }
          ]
        }
      ]
    }
  ],

  // Week schedule
  "weeks": [
    {
      "numero": 1,
      "estDecharge": false,
      "occurrences": [
        { "occurrenceCode": "W1D1", "numero": 1, "blueprintCode": "BP-PUSH-A" },
        { "occurrenceCode": "W1D2", "numero": 2, "blueprintCode": "BP-PULL-A" },
        { "occurrenceCode": "W1D3", "numero": 3, "blueprintCode": "BP-LEGS-A" }
      ]
    }
  ]
}
```

## Import commands

### Validate only (no DB writes)

```bash
node scripts/program_catalog_import.cjs --dry-run --dir assets/program-catalog/generated
```

### Validate + import as DRAFT

```bash
node scripts/program_catalog_import.cjs --apply-drafts --dir assets/program-catalog/generated
```

Set `DATABASE_URL` in your environment before running with `--apply-drafts`.

## Editorial lifecycle

Programs go through the following states after import:

```
DRAFT → COACH_REVIEW → VALIDATED → PUBLISHED
  ↘                                   ↗
                  RETIRED
```

- **DRAFT** — freshly imported; not visible to users.
- **COACH_REVIEW** — sent to a coach for review.
- **VALIDATED** — approved by a coach; ready for publication.
- **PUBLISHED** — visible to users. Immutable (a new `versionCode` is required for any content change).
- **RETIRED** — no longer available; can be reached from any state.

Use `ProgramImportService.transition(programId, target, actorId, expectedChecksum)` to move a program through the lifecycle.

## Idempotency

The import is fully idempotent:

- Importing the same manifest twice (same `versionCode` + same `checksum`) is a no-op and returns `{created: false}`.
- Importing a manifest with the same `versionCode` but different content updates the program (only if it is not PUBLISHED).
- Attempting to overwrite a PUBLISHED program with different content throws HTTP 409.

## Tests

```bash
node --test src/gymbro/programs/program-import.test.cjs
```

All tests use an in-memory Prisma mock and require no database connection.
