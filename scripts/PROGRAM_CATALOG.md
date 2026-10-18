# Program catalog — bindings and substitutions

The program catalog defines how abstract program slots (e.g. `HP`, `FS`, `VR`) map to
concrete exercises from the exercise catalog, and how those exercises can be substituted
based on available equipment or client reasons.

## Files

| File | Purpose |
|---|---|
| `assets/program-catalog/exercise-bindings.json` | Slot → exercise mappings (PRIMARY + alternatives A1–A3) |
| `assets/program-catalog/substitutions.json` | Directed substitution rules (A → B, not B → A) |
| `src/gymbro/programs/contracts/program-contracts.ts` | TypeScript interfaces for all catalog types |
| `src/gymbro/programs/equipment-resolver.ts` | `resolveSlot` / `resolveSubstitution` / `validateBindings` |

## Slot codes (22 total)

| Code | Description | Notes |
|---|---|---|
| SQ | Squat | L=dumbbells, M=Smith machine, BW=bodyweight |
| UNI | Unilateral leg | L=dumbbells, M=Smith split |
| HN | Hip hinge narrow | L=dumbbells, BAR=barbell |
| KF | Knee flexion (curl) | EL=band inverse, M=leg curl machine |
| HE | Hip extension | BW=glute bridge, BAR=barbell hip thrust |
| HP | Horizontal push | L=dumbbells (0289), M=chest machine (0577), BW=push-up (0259) |
| IP | Incline push | L=dumbbells (0314), M=incline machine (1299) |
| VP | Vertical push | L=dumbbells (0405), M=shoulder machine (0587) |
| HR | Horizontal row | L=dumbbells (0293), M=cable row (0861) |
| VR | Vertical row | M=lat pulldown (2330), BW=pull-up (0651) |
| LA | Lateral raise | L=dumbbells (0334), M=cable (0178) |
| RD | Rear delt | L=dumbbells (0326), M=cable (0602) |
| EF | Elbow flexion (curl) | L=dumbbells (0285), M=cable (0868) |
| EE | Elbow extension (tricep) | L=dumbbells (0351), M=cable (0200) |
| CA | Calf raise | BW (1373), M=calf machine (0594) |
| AE | Abdominal extension | All=crunch (0276) |
| AL | Abdominal lateral | All=oblique (1775) |
| AF | Abdominal flexion | CABLE=cable crunch (0175), BW=leg raise (0212) |
| CO | Cardio | M=treadmill (2331), M2=bike (2138) |
| FS | Free squat (barbell) | Requires RACK+SAFETY_BARS+BARBELL (0043) |
| FB | Free bench (barbell) | Requires BENCH+SAFETY_BARS+BARBELL (0025) |
| FR | Free row (barbell) | Requires BARBELL (0085) |

## Equipment keys

Equipment codes used in `requiredEquipment` arrays:

- `DUMBBELLS` — dumbbell set
- `BARBELL` — olympic barbell
- `RACK` — squat / power rack
- `SAFETY_BARS` — safety bars / spotter arms
- `BENCH` — flat bench
- `MACHINE_SMITH` — Smith machine
- `MACHINE_CHEST_PRESS` — horizontal chest press machine
- `MACHINE_INCLINE_PRESS` — incline press machine
- `MACHINE_SHOULDER_PRESS` — shoulder press machine
- `MACHINE_LEG_CURL` — seated or lying leg curl
- `MACHINE_CALF` — standing or seated calf raise machine
- `MACHINE_ROW` — lever row machine
- `CABLE_MACHINE` — cable station (single)
- `CABLE_ROW` — cable row attachment
- `LAT_PULLDOWN` — lat pulldown machine
- `ASSISTED_PULLUP` — assisted pull-up machine
- `PULLUP_BAR` — overhead bar for pull-ups
- `BAND` — resistance band
- `HIGH_ANCHOR` — overhead anchor point for bands
- `EZ_BAR` — EZ-curl bar
- `TREADMILL` — treadmill
- `STATIONARY_BIKE` — stationary bike

## Load conventions

| Convention | Usage |
|---|---|
| `TOTAL_EXTERNAL` | Barbell total (FS, FB, FR) — plates + bar |
| `PER_DUMBBELL` | Load per dumbbell (HP-L) |
| `MACHINE_DISPLAY` | Weight shown on machine stack (HP-M, VR-M) |
| `BODYWEIGHT` | No external load (AE, AL, BW variants) |

## Excluded sourceIds

The following sourceIds must never appear as PRIMARY bindings:

- `0599`, `0705`, `0430`, `3523`

These are enforced by `validateBindings()` in `equipment-resolver.ts`.

## Resolution logic

```
resolveSlot(slot, profile, inventory)
  → find all bindings for slot, sorted PRIMARY → A1 → A2 → A3 (then by priority)
  → for each approved binding:
      if all requiredEquipment available → RESOLVED (recalibrateLoad=true if grade ≠ PRIMARY)
  → if nothing resolves:
      - requiredEquipment contains HIGH_ANCHOR and anchor missing → UNRESOLVED MISSING_ANCHOR
      - otherwise → UNRESOLVED MISSING_EQUIPMENT
      - no approved binding at all → UNRESOLVED NO_APPROVED_ALTERNATIVE

resolveSubstitution({slot, profile, inventory, reason, originalExerciseCode?})
  → reason === 'PAIN' → {status: 'NEEDS_REVIEW'} always
  → look up directed substitution rules from slot.exerciseCode
  → skip rules targeting originalExerciseCode (prevents reverse substitution)
  → check equipment conditions and minLevel
  → first passing rule → RESOLVED with A1/A2 grade
  → no rule passes → UNRESOLVED NO_APPROVED_ALTERNATIVE
```

## Substitution directionality

Substitutions are directed: `HP-L → HP-M` is a separate rule from `HP-M → HP-L`.
The `originalExerciseCode` parameter prevents A→B→A circular substitution loops.

## Running tests

```bash
cd gympass_backend
node --test src/gymbro/programs/exercise-resolution.test.cjs
```

All 13 tests should pass (10 originally specified + 3 sub-cases added for T3/T5).

## Build check

```bash
npm run build
```
