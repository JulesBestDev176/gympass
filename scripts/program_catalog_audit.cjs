#!/usr/bin/env node
'use strict';

/**
 * GymBro Program Catalog Audit Script
 * Task 1: Freeze program catalog contracts and audit
 *
 * Usage:
 *   node scripts/program_catalog_audit.cjs --output ../output/research/program-catalog-2026-10-18/implementation-baseline.json
 *
 * Reads families.json and exercise catalog.json (read-only).
 * Does NOT connect to the database, does NOT modify any files.
 * Writes a JSON report to the output path, creating directories if needed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let outputPath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' && args[i + 1]) {
    outputPath = args[i + 1];
    i++;
  }
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const FAMILIES_PATH = path.join(ROOT, 'assets', 'program-catalog', 'families.json');
const CATALOG_PATH  = path.join(ROOT, 'assets', 'exercise-catalog', 'catalog.json');

// ── Known session blueprint codes (from sections 8.2–8.17 of the catalog doc) ─

const KNOWN_BLUEPRINTS = new Set([
  // Discovery & Return (8.2)
  'D-A', 'D-B', 'D-C',
  'R-A', 'R-B',
  // Full-body hypertrophy (8.3)
  'H-A', 'H-B', 'H-C',
  // Upper/Lower (8.4)
  'U-A', 'L-A', 'U-B', 'L-B',
  // Strength (8.5)
  'F-A', 'F-B', 'F-C',
  'FU-A', 'FL-A', 'FU-B', 'FL-B',
  // Fitness & sport (8.6)
  'G-A', 'G-B', 'G-C',
  'S-A', 'S-B',
  // Express (8.7)
  'EX-A', 'EX-B', 'EX-C',
  // 30-minute express (8.11)
  'E30-A', 'E30-B', 'E30-C',
  // Minimal 1x (8.8)
  'MIN-A',
  // PPL (8.9)
  'PP-A', 'PP-B', 'PP-C',
  'PP6-A', 'PP6-B', 'PP6-C',
  // Home / outdoor (8.10)
  'DOM-A', 'DOM-B', 'DOM-C',
  'EXT-A', 'EXT-B',
  // Short FB + compact (8.11)
  'H2-A', 'H2-B',
  'MC-A', 'MC-B', 'MC-C',
  'MT-A', 'MT-B',
  // Muscle priority (8.12)
  'UBK-A', 'UBK-B',
  'UR-A', 'UR-B',
  'LG-A', 'LG-B',
  // Strength 2d + 5d format (8.13)
  'F2-A', 'F2-B',
  'T5-P', 'T5-R', 'T5-L',
  // Upper body priority (8.14)
  'PH-A', 'PH-B',
  // Lower body priority (8.15)
  'PB-A', 'PB-B',
  // ULF 5-day strength (8.16)
  'ULF-A', 'ULF-B', 'ULF-C',
  // Circuit training (8.17)
  'CT-A', 'CT-B',
]);

// ── Section 16 slot → sourceId priority mappings ─────────────────────────────

const SECTION_16_SLOT_MAPPINGS = [
  { slot: 'SQ',  option: 'L', sourceId: '1760', name: 'dumbbell goblet squat' },
  { slot: 'SQ',  option: 'M', sourceId: '0770', name: 'smith squat' },
  { slot: 'SQ',  option: 'BW', sourceId: '3543', name: 'bodyweight drop jump squat' },
  { slot: 'UNI', option: 'L', sourceId: '0336', name: 'dumbbell lunge' },
  { slot: 'UNI', option: 'M', sourceId: '0770', name: 'smith squat (split variant)' },
  { slot: 'HN',  option: 'L', sourceId: '1459', name: 'dumbbell romanian deadlift' },
  { slot: 'HN',  option: 'M', sourceId: '0085', name: 'barbell romanian deadlift' },
  { slot: 'KF',  option: 'M', sourceId: '0586', name: 'lever lying leg curl' },
  { slot: 'KF',  option: 'BW', sourceId: '0496', name: 'inverse leg curl (bench support)' },
  { slot: 'HE',  option: 'BW', sourceId: '3561', name: 'glute bridge march' },
  { slot: 'HP',  option: 'L', sourceId: '0289', name: 'dumbbell bench press' },
  { slot: 'HP',  option: 'M', sourceId: '0577', name: 'lever chest press' },
  { slot: 'HP',  option: 'BW', sourceId: '0259', name: 'close-grip push-up' },
  { slot: 'IP',  option: 'L', sourceId: '0314', name: 'dumbbell incline bench press' },
  { slot: 'IP',  option: 'M', sourceId: '1299', name: 'lever incline chest press' },
  { slot: 'VP',  option: 'L', sourceId: '0405', name: 'dumbbell seated shoulder press' },
  { slot: 'VP',  option: 'M', sourceId: '0587', name: 'lever military press' },
  { slot: 'HR',  option: 'L', sourceId: '0293', name: 'dumbbell bent over row' },
  { slot: 'HR',  option: 'M', sourceId: '0861', name: 'cable seated row' },
  { slot: 'VR',  option: 'M', sourceId: '2330', name: 'cable lat pulldown full range of motion' },
  { slot: 'VR',  option: 'BW', sourceId: '0017', name: 'assisted pull-up' },
  { slot: 'LA',  option: 'L', sourceId: '0334', name: 'dumbbell lateral raise' },
  { slot: 'LA',  option: 'M', sourceId: '0178', name: 'cable lateral raise' },
  { slot: 'RD',  option: 'L', sourceId: '0326', name: 'dumbbell incline rear lateral raise' },
  { slot: 'RD',  option: 'M', sourceId: '0602', name: 'lever seated reverse fly' },
  { slot: 'EF',  option: 'L', sourceId: '0285', name: 'dumbbell alternate biceps curl' },
  { slot: 'EF',  option: 'M', sourceId: '0868', name: 'cable curl' },
  { slot: 'EE',  option: 'M', sourceId: '0200', name: 'cable pushdown (with rope attachment)' },
  { slot: 'EE',  option: 'L', sourceId: '0351', name: 'dumbbell lying triceps extension' },
  { slot: 'CA',  option: 'L', sourceId: '1373', name: 'bodyweight standing calf raise' },
  { slot: 'CA',  option: 'M', sourceId: '0594', name: 'lever seated calf raise' },
  { slot: 'AE',  option: 'L', sourceId: '0276', name: 'dead bug' },
  { slot: 'AE',  option: 'M', sourceId: '0276', name: 'dead bug' },
  { slot: 'AL',  option: 'L', sourceId: '1775', name: 'side plank hip adduction' },
  { slot: 'AL',  option: 'M', sourceId: '1775', name: 'side plank hip adduction' },
  { slot: 'AF',  option: 'M', sourceId: '0175', name: 'cable kneeling crunch' },
  { slot: 'CO',  option: 'M', sourceId: '2331', name: 'cycle cross trainer' },
  { slot: 'FS',  option: 'L', sourceId: '0043', name: 'barbell full squat' },
  { slot: 'FS',  option: 'M', sourceId: '0043', name: 'barbell full squat (requires rack)' },
  { slot: 'FB',  option: 'L', sourceId: '0025', name: 'barbell bench press' },
  { slot: 'FB',  option: 'M', sourceId: '0025', name: 'barbell bench press (requires bench/safeties)' },
  { slot: 'FR',  option: 'L', sourceId: '0085', name: 'barbell romanian deadlift' },
  { slot: 'FR',  option: 'M', sourceId: '0085', name: 'barbell romanian deadlift' },
];

// ── Slots initially unresolved, now resolved (to be flagged) ─────────────────

const NEWLY_RESOLVED_SLOTS = [
  { slot: 'HE',  sourceId: '3561', note: 'glute bridge march BW for beginner/home' },
  { slot: 'SQ-BW', sourceId: '3543', note: 'bodyweight drop jump squat (use no-jump variant for beginners)' },
  { slot: 'HP-BW', sourceId: '0259', note: 'close-grip push-up' },
  { slot: 'EE',  sourceId: '0351', note: 'dumbbell lying triceps extension' },
  { slot: 'CO',  sourceId: '2331', note: 'cycle cross trainer' },
  { slot: 'VR-EL', sourceId: '0974', note: 'band close-grip pulldown (requires verified high anchor)' },
];

// ── SourceIds to EXCLUDE from auto-binding (plan task 4) ─────────────────────

const EXCLUDED_FROM_AUTO_BINDING = [
  { sourceId: '0599', reason: 'leg curl assis: apparent knee extension movement, not hamstring curl' },
  { sourceId: '0705', reason: 'side bridge dynamic: not a static plank' },
  { sourceId: '0430', reason: 'triceps extension: elbow movement insufficiently clear' },
  { sourceId: '3523', reason: 'hands on bench: not a hip thrust with upper back supported' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('GymBro Program Catalog Audit — 2026-10-18');
  console.log('==========================================\n');

  // ── 1. Load families ───────────────────────────────────────────────────────

  if (!fs.existsSync(FAMILIES_PATH)) {
    console.error(`ERROR: families.json not found at ${FAMILIES_PATH}`);
    process.exit(1);
  }
  const familiesData = JSON.parse(fs.readFileSync(FAMILIES_PATH, 'utf8'));
  const families = familiesData.families;

  // ── 2. Load exercise catalog ───────────────────────────────────────────────

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`ERROR: catalog.json not found at ${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const exercises = catalog.exercises;

  // Index by sourceId for O(1) lookups
  const catalogIndex = new Map();
  for (const ex of exercises) {
    catalogIndex.set(String(ex.sourceId), ex);
  }

  // ── 3. Compute family / version counts ────────────────────────────────────

  const familyCount = families.length;
  let versionCount = 0;
  const allVariantCodes = [];
  for (const f of families) {
    versionCount += (f.variantCodes || []).length;
    allVariantCodes.push(...(f.variantCodes || []));
  }

  // ── 4. Check all blueprint codes are known ─────────────────────────────────

  const unknownBlueprints = new Set();
  const usedBlueprints = new Set();
  for (const f of families) {
    for (const weekBps of (f.weekBlueprints || [])) {
      for (const bp of weekBps) {
        usedBlueprints.add(bp);
        if (!KNOWN_BLUEPRINTS.has(bp)) {
          unknownBlueprints.add(bp);
        }
      }
    }
  }

  // ── 5. Validate section 16 slot→sourceId mappings ────────────────────────

  const slotResolutionResults = [];
  let unresolvedSlots = 0;

  for (const mapping of SECTION_16_SLOT_MAPPINGS) {
    const ex = catalogIndex.get(mapping.sourceId);
    const resolved = !!ex && ex.hasAnimation === true;
    if (!resolved) unresolvedSlots++;
    slotResolutionResults.push({
      slot: mapping.slot,
      option: mapping.option,
      sourceId: mapping.sourceId,
      name: mapping.name,
      foundInCatalog: !!ex,
      hasAnimation: ex ? ex.hasAnimation : false,
      status: resolved ? 'RESOLVED' : (ex ? 'NEEDS_REVIEW' : 'NOT_FOUND'),
    });
  }

  // ── 6. Exercises with animation count ────────────────────────────────────

  const exercisesWithAnimation = exercises.filter(e => e.hasAnimation === true).length;
  const exercisesWithoutAnimation = exercises.length - exercisesWithAnimation;

  // ── 7. Equipment type breakdown (from equipementRequis field) ─────────────

  const equipmentCounts = {};
  for (const ex of exercises) {
    const eq = ex.equipementRequis || 'unknown';
    equipmentCounts[eq] = (equipmentCounts[eq] || 0) + 1;
  }

  // ── 8. Verify newly resolved slots exist in catalog ───────────────────────

  const newlyResolvedStatus = NEWLY_RESOLVED_SLOTS.map(entry => {
    const ex = catalogIndex.get(entry.sourceId);
    return {
      ...entry,
      foundInCatalog: !!ex,
      hasAnimation: ex ? ex.hasAnimation : false,
      status: ex && ex.hasAnimation ? 'CONFIRMED' : (ex ? 'FOUND_NO_ANIMATION' : 'NOT_FOUND'),
    };
  });

  // ── 9. Verify excluded sourceIds are in catalog ───────────────────────────

  const excludedStatus = EXCLUDED_FROM_AUTO_BINDING.map(entry => {
    const ex = catalogIndex.get(entry.sourceId);
    return {
      ...entry,
      foundInCatalog: !!ex,
      hasAnimation: ex ? ex.hasAnimation : false,
      nameInCatalog: ex ? ex.nameOriginal : null,
    };
  });

  // ── 10. P30 session count check (should be 36 over 12 weeks, 3/week) ──────

  const p30 = families.find(f => f.familyCode === 'P30');
  const p30SessionCount = p30
    ? p30.weekBlueprints.reduce((sum, week) => sum + week.length, 0)
    : null;

  // ── 11. P32 session count check (4×4 + 8×2 = 32) ────────────────────────

  const p32 = families.find(f => f.familyCode === 'P32');
  const p32SessionCount = p32
    ? p32.weekBlueprints.reduce((sum, week) => sum + week.length, 0)
    : null;
  const p32SessionsPerWeek = p32
    ? p32.weekBlueprints.map(w => w.length)
    : null;

  // ── 12. Session blueprint count ───────────────────────────────────────────

  const sessionBlueprintCount = usedBlueprints.size;

  // ── Build report ──────────────────────────────────────────────────────────

  const auditTimestamp = new Date().toISOString();

  const report = {
    auditDate: '2026-10-18',
    generatedAt: auditTimestamp,
    source: {
      familiesFile: FAMILIES_PATH,
      catalogFile: CATALOG_PATH,
      catalogRevision: catalog.revision,
      catalogSource: catalog.source,
    },
    summary: {
      familyCount,
      versionCount,
      sessionBlueprintCount,
      unresolvedSlots,
      exercisesTotal: exercises.length,
      exercisesWithAnimation,
      exercisesWithoutAnimation,
      unknownBlueprintCount: unknownBlueprints.size,
    },
    structuralChecks: {
      p30TotalSessions: p30SessionCount,
      p30Expected: 36,
      p30Ok: p30SessionCount === 36,
      p32TotalSessions: p32SessionCount,
      p32Expected: 32,
      p32Ok: p32SessionCount === 32,
      p32SessionsPerWeek,
      p32ExpectedPattern: [4,4,4,4,2,2,2,2,2,2,2,2],
      p32PatternOk: p32SessionsPerWeek
        ? JSON.stringify(p32SessionsPerWeek) === JSON.stringify([4,4,4,4,2,2,2,2,2,2,2,2])
        : false,
    },
    variantCodes: allVariantCodes.sort(),
    usedBlueprintCodes: Array.from(usedBlueprints).sort(),
    unknownBlueprintCodes: Array.from(unknownBlueprints).sort(),
    section16SlotResolutions: slotResolutionResults,
    newlyResolvedSlots: newlyResolvedStatus,
    excludedFromAutoBinding: excludedStatus,
    equipmentBreakdown: Object.entries(equipmentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([equipement, count]) => ({ equipement, count })),
  };

  // ── Print summary ─────────────────────────────────────────────────────────

  console.log(`Families      : ${familyCount} (expected 37)`);
  console.log(`Versions      : ${versionCount} (expected 74)`);
  console.log(`Blueprints    : ${sessionBlueprintCount} unique blueprint codes used`);
  console.log(`Unknown BPs   : ${unknownBlueprints.size}${unknownBlueprints.size > 0 ? ' — ' + Array.from(unknownBlueprints).join(', ') : ''}`);
  console.log(`Exercises     : ${exercises.length} total, ${exercisesWithAnimation} animated`);
  console.log(`Unresolved    : ${unresolvedSlots} slot mappings from section 16`);
  console.log();
  console.log(`P30 sessions  : ${p30SessionCount} (expected 36) — ${p30SessionCount === 36 ? 'OK' : 'FAIL'}`);
  console.log(`P32 sessions  : ${p32SessionCount} (expected 32) — ${p32SessionCount === 32 ? 'OK' : 'FAIL'}`);
  if (p32SessionsPerWeek) {
    const patternOk = JSON.stringify(p32SessionsPerWeek) === JSON.stringify([4,4,4,4,2,2,2,2,2,2,2,2]);
    console.log(`P32 pattern   : [${p32SessionsPerWeek.join(',')}] — ${patternOk ? 'OK' : 'FAIL'}`);
  }
  console.log();
  console.log('Newly resolved slots (flagged):');
  for (const nr of newlyResolvedStatus) {
    console.log(`  ${nr.slot.padEnd(8)} sourceId=${nr.sourceId} status=${nr.status}`);
  }
  console.log();
  console.log('Excluded from auto-binding (task 4):');
  for (const ex of excludedStatus) {
    console.log(`  ${ex.sourceId} — ${ex.reason}`);
  }

  // ── Write report ──────────────────────────────────────────────────────────

  if (outputPath) {
    const absOutput = path.resolve(__dirname, '..', outputPath);
    fs.mkdirSync(path.dirname(absOutput), { recursive: true });
    fs.writeFileSync(absOutput, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nReport written to: ${absOutput}`);
  } else {
    console.log('\n(No --output path specified; report not written to disk.)');
  }

  // Exit non-zero if structural checks fail
  const hasErrors =
    unknownBlueprints.size > 0 ||
    !report.structuralChecks.p30Ok ||
    !report.structuralChecks.p32Ok ||
    !report.structuralChecks.p32PatternOk;

  if (hasErrors) {
    console.error('\nAudit FAILED — see issues above.');
    process.exit(1);
  } else {
    console.log('\nAudit completed successfully.');
  }
}

main();
