/**
 * GymBro Program Catalog — Program Compiler
 * Task 5: Compile family definitions + exercise bindings into 74 program manifests
 *
 * Pure function — no Prisma, no HTTP, no side effects.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ProgramManifest,
  CompiledSession,
  ProgramExerciseSlot,
  FamilyDefinition,
  ExerciseBinding,
} from './contracts/program-contracts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlueprintDef {
  slotCodes: string[];
  format: 'STANDARD' | 'CIRCUIT';
}

interface BlueprintsFile {
  schemaVersion: number;
  blueprints: Record<string, BlueprintDef>;
}

interface FullPrescription {
  metric: 'REPS' | 'DURATION';
  workingSets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationMinSeconds?: number | null;
  durationMaxSeconds?: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  restTargetSeconds: number;
  restAllowedMaxSeconds: number;
  loadConvention: string;
  initialLoadKg: string | null;
}

// Extend ProgramExerciseSlot to include prescription for validator
interface CompiledSlot extends ProgramExerciseSlot {
  prescription: FullPrescription;
}

// ── Load session-blueprints.json ──────────────────────────────────────────────

let _blueprints: BlueprintsFile | null = null;

function getBlueprintsFile(): BlueprintsFile {
  if (_blueprints) return _blueprints;
  const filePath = join(__dirname, '../../../assets/program-catalog/session-blueprints.json');
  _blueprints = JSON.parse(readFileSync(filePath, 'utf-8')) as BlueprintsFile;
  return _blueprints;
}

// ── Prescription builder ──────────────────────────────────────────────────────

// Slots that use DURATION metric
const DURATION_SLOTS = new Set(['CO']);

// Slots treated as bodyweight (AE, AL)
const BODYWEIGHT_SLOTS = new Set(['AE', 'AL']);

// Slots treated as barbell compound lifts (FS, FB, FR)
const BARBELL_COMPOUND_SLOTS = new Set(['FS', 'FB', 'FR']);

// Slots treated as isolation/accessory
const ACCESSORY_SLOTS = new Set(['LA', 'RD', 'EF', 'EE', 'CA']);

function buildPrescription(
  slotCode: string,
  variant: string,
  binding: ExerciseBinding | null,
  isCircuit: boolean,
): FullPrescription {
  // Determine load convention
  let loadConvention: string;
  if (binding?.prescriptionOverride?.loadConvention) {
    loadConvention = binding.prescriptionOverride.loadConvention as string;
  } else if (BODYWEIGHT_SLOTS.has(slotCode)) {
    loadConvention = 'BODYWEIGHT';
  } else if (BARBELL_COMPOUND_SLOTS.has(slotCode)) {
    loadConvention = 'TOTAL_EXTERNAL';
  } else if (variant === 'M') {
    loadConvention = 'MACHINE_DISPLAY';
  } else {
    loadConvention = 'PER_DUMBBELL';
  }

  if (isCircuit) {
    return {
      metric: 'REPS',
      workingSets: 1,
      repsMin: 12,
      repsMax: 15,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      targetRirMin: 3,
      targetRirMax: 4,
      restTargetSeconds: 0,
      restAllowedMaxSeconds: 0,
      loadConvention,
      initialLoadKg: null,
    };
  }

  if (DURATION_SLOTS.has(slotCode)) {
    return {
      metric: 'DURATION',
      workingSets: 1,
      repsMin: null,
      repsMax: null,
      durationMinSeconds: 600,
      durationMaxSeconds: 1200,
      targetRirMin: null,
      targetRirMax: null,
      restTargetSeconds: 0,
      restAllowedMaxSeconds: 0,
      loadConvention: 'BODYWEIGHT',
      initialLoadKg: null,
    };
  }

  if (BODYWEIGHT_SLOTS.has(slotCode)) {
    return {
      metric: 'REPS',
      workingSets: 3,
      repsMin: 8,
      repsMax: 12,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      targetRirMin: null,
      targetRirMax: null,
      restTargetSeconds: 60,
      restAllowedMaxSeconds: 90,
      loadConvention: 'BODYWEIGHT',
      initialLoadKg: null,
    };
  }

  if (BARBELL_COMPOUND_SLOTS.has(slotCode)) {
    return {
      metric: 'REPS',
      workingSets: 4,
      repsMin: 4,
      repsMax: 6,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      targetRirMin: 1,
      targetRirMax: 2,
      restTargetSeconds: 180,
      restAllowedMaxSeconds: 240,
      loadConvention: 'TOTAL_EXTERNAL',
      initialLoadKg: null,
    };
  }

  if (ACCESSORY_SLOTS.has(slotCode)) {
    return {
      metric: 'REPS',
      workingSets: 3,
      repsMin: 10,
      repsMax: 15,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      targetRirMin: 2,
      targetRirMax: 3,
      restTargetSeconds: 90,
      restAllowedMaxSeconds: 120,
      loadConvention,
      initialLoadKg: null,
    };
  }

  // Default: main compound (SQ, UNI, HN, HE, HP, IP, VP, HR, VR, KF)
  return {
    metric: 'REPS',
    workingSets: 3,
    repsMin: 8,
    repsMax: 12,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    targetRirMin: 2,
    targetRirMax: 3,
    restTargetSeconds: 120,
    restAllowedMaxSeconds: 180,
    loadConvention,
    initialLoadKg: null,
  };
}

// ── estimateSessionSeconds ────────────────────────────────────────────────────

export function estimateSessionSeconds(session: CompiledSession): number {
  const BASE = 300;

  if (session.format === 'CIRCUIT') {
    const rounds = session.rounds ?? 2;
    const slots = session.slots as CompiledSlot[];
    const slotsCount = slots.length;
    let avgRepsSeconds = 0;
    for (const slot of slots) {
      const p = slot.prescription;
      if (p.metric === 'DURATION') {
        avgRepsSeconds += (p.durationMaxSeconds ?? 60);
      } else {
        avgRepsSeconds += (p.repsMax ?? 15) * 3;
      }
    }
    avgRepsSeconds = slotsCount > 0 ? avgRepsSeconds / slotsCount : 45;

    const betweenExercise = session.betweenExerciseRestSeconds ?? 30;
    const betweenRound = session.betweenRoundRestSeconds ?? 90;
    const totalSeconds =
      rounds * (slotsCount * avgRepsSeconds + betweenExercise * (slotsCount - 1)) +
      (rounds - 1) * betweenRound +
      BASE;
    return Math.max(1, Math.round(totalSeconds));
  }

  // STANDARD
  let total = BASE;
  for (const slot of session.slots as CompiledSlot[]) {
    const p = slot.prescription;
    let avgRepsSeconds: number;
    if (p.metric === 'DURATION') {
      avgRepsSeconds = p.durationMaxSeconds ?? 60;
    } else {
      avgRepsSeconds = (p.repsMax ?? 12) * 3;
    }
    total += p.workingSets * (avgRepsSeconds + p.restTargetSeconds);
  }
  return Math.max(1, Math.round(total));
}

// ── Phase assignment ──────────────────────────────────────────────────────────

function getPhaseNumber(weekNumber: number, familyCode: string): number {
  if (familyCode === 'P32') {
    if (weekNumber <= 4) return 1;
    return 2;
  }
  if (weekNumber <= 4) return 1;
  if (weekNumber <= 8) return 2;
  return 3;
}

// ── findBinding ───────────────────────────────────────────────────────────────

function findBinding(
  slotCode: string,
  variant: string,
  bindings: ExerciseBinding[],
): ExerciseBinding | null {
  // Try exact variant match with PRIMARY grade
  const exact = bindings.find(
    b => b.slotCode === slotCode && b.variant === variant && b.grade === 'PRIMARY',
  );
  if (exact) return exact;

  // Try any PRIMARY grade for this slot
  const anyPrimary = bindings.find(
    b => b.slotCode === slotCode && b.grade === 'PRIMARY',
  );
  if (anyPrimary) {
    console.warn(
      `[program-compiler] No binding for slot=${slotCode} variant=${variant}; ` +
      `falling back to variant=${anyPrimary.variant}`,
    );
    return anyPrimary;
  }

  // Try any binding for this slot
  const any = bindings.find(b => b.slotCode === slotCode);
  if (any) {
    console.warn(
      `[program-compiler] No PRIMARY binding for slot=${slotCode}; ` +
      `falling back to grade=${any.grade} variant=${any.variant}`,
    );
    return any;
  }

  console.warn(`[program-compiler] No binding at all for slot=${slotCode}`);
  return null;
}

// ── compileProgram ────────────────────────────────────────────────────────────

export function compileProgram(
  family: FamilyDefinition,
  versionCode: string,
  bindings: ExerciseBinding[],
): ProgramManifest {
  // Determine variant from versionCode (e.g. "P01-L-v1" → "L")
  const parts = versionCode.split('-');
  // versionCode format: P01-L-v1 → parts[1]
  // But some are P18-EL-v1 → variant is "EL"
  // Find the variant segment: everything between first and last '-v' segment
  const vMatch = versionCode.match(/^[^-]+-(.+)-v\d+$/);
  const variant = vMatch ? vMatch[1] : 'L';

  const blueprintsFile = getBlueprintsFile();

  let sessionCounter = 0;

  const weeks = family.weekBlueprints.map((blueprintCodes, weekIndex) => {
    const weekNumber = weekIndex + 1;
    const phaseNumber = getPhaseNumber(weekNumber, family.familyCode);

    const sessions: CompiledSession[] = blueprintCodes.map((blueprintCode, sessionIndex) => {
      sessionCounter++;
      const sessionNumber = sessionCounter;
      const occurrenceCode = `${versionCode}-W${weekNumber}-S${sessionIndex + 1}`;

      const blueprintDef = blueprintsFile.blueprints[blueprintCode];
      if (!blueprintDef) {
        console.warn(`[program-compiler] Unknown blueprint code: ${blueprintCode}`);
      }

      const slotCodes = blueprintDef ? blueprintDef.slotCodes : [];
      const format = blueprintDef ? blueprintDef.format : 'STANDARD';
      const isCircuit = format === 'CIRCUIT';

      // CT circuit rounds: weeks 1-2 → 2, weeks 3-12 → 3
      const rounds: number | null = isCircuit ? (weekNumber <= 2 ? 2 : 3) : null;
      const betweenExerciseRestSeconds: number | null = isCircuit ? 30 : null;
      const betweenRoundRestSeconds: number | null = isCircuit ? 90 : null;

      const slots: CompiledSlot[] = slotCodes.map((slotCode, slotIndex) => {
        const binding = findBinding(slotCode, variant, bindings);
        const prescription = buildPrescription(slotCode, variant, binding, isCircuit);

        const slot: CompiledSlot = {
          slotCode,
          variant: binding ? binding.variant : variant,
          exerciseCode: binding ? binding.exerciseCode : `${slotCode}-UNKNOWN`,
          sessionPosition: slotIndex + 1,
          defaultPrescription: {
            sets: prescription.workingSets,
            repsMin: prescription.repsMin ?? 0,
            repsMax: prescription.repsMax ?? 0,
            restSec: prescription.restTargetSeconds,
            loadConvention: prescription.loadConvention as any,
          },
          prescription,
        };
        return slot;
      });

      const session: CompiledSession = {
        occurrenceCode,
        blueprintCode,
        sessionNumber,
        format,
        slots: slots as ProgramExerciseSlot[],
        rounds,
        betweenExerciseRestSeconds,
        betweenRoundRestSeconds,
        estimatedSeconds: 0,
        measuredSeconds: null,
      };

      // Compute estimated seconds
      session.estimatedSeconds = estimateSessionSeconds(session);

      return session;
    });

    return { weekNumber, phaseNumber, sessions };
  });

  const manifest: ProgramManifest = {
    schemaVersion: 'gymbro-program-catalog/1',
    familyCode: family.familyCode,
    versionCode,
    status: 'DRAFT',
    durationWeeks: 12,
    goalCoverage: family.goalCoverage,
    prescriptionPolicy: family.prescriptionPolicy,
    progressionPolicy: family.progressionPolicy,
    maxSessionMinutes: family.maxSessionMinutes,
    weeks,
  };

  return manifest;
}
