// ─────────────────────────── PROGRAM CONTRACTS ───────────────────────────────
// Shared type definitions for the program catalog import pipeline.
// These are pure TypeScript interfaces — no NestJS, no Prisma, no runtime deps.

export type EditorialStatus =
  | 'DRAFT'
  | 'COACH_REVIEW'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'RETIRED';

export type SlotGrade = 'PRIMARY' | 'ALTERNATE' | 'OPTIONAL';
export type SlotRole = 'WARMUP' | 'MAIN' | 'ACCESSORY' | 'COOLDOWN' | 'FINISHER';
export type ExerciseMetric = 'REPS' | 'TIME' | 'DISTANCE' | 'CALORIES';
export type SessionFormat = 'STANDARD' | 'CIRCUIT' | 'SUPERSET' | 'EMOM' | 'AMRAP';

// ── Slot option ───────────────────────────────────────────────────────────────

export interface SlotOption {
  /** Stable identifier of the GymbroExercise (cuid or external id) */
  exerciseId: string;
  grade: SlotGrade;
  priority: number;
  approved: boolean;
  prescriptionOverride?: Record<string, unknown>;
}

// ── Session slot ──────────────────────────────────────────────────────────────

export interface SessionSlot {
  slotCode: string;
  slotRole?: SlotRole;
  ordre: number;
  nbSeries: number;
  repsMin: number;
  repsMax: number;
  tempsReposSec?: number;
  metric?: ExerciseMetric;
  workingSets?: number;
  repsMin2?: number;
  repsMax2?: number;
  notes?: string;
  options: SlotOption[];
}

// ── Blueprint (session template) ─────────────────────────────────────────────

export interface SessionBlueprint {
  blueprintCode: string;
  nom: string;
  description?: string;
  sessionFormat?: SessionFormat;
  rounds?: number;
  slots: SessionSlot[];
}

// ── Occurrence (week × day assignment) ───────────────────────────────────────

export interface WeekOccurrence {
  occurrenceCode: string;
  numero: number; // day number within the week
  blueprintCode: string;
}

// ── Week ─────────────────────────────────────────────────────────────────────

export interface ProgramWeek {
  numero: number;
  estDecharge: boolean;
  occurrences: WeekOccurrence[];
}

// ── Family ────────────────────────────────────────────────────────────────────

export interface ProgramFamily {
  familyCode: string;
  goalCoverage: string[];
  prescriptionPolicy?: string;
  progressionPolicy?: string;
  maxSessionMinutes?: number;
}

// ── Program Manifest (the top-level compiled artifact) ───────────────────────

export interface ProgramManifest {
  /** Stable, human-readable identifier: e.g. "force-debutant-3j-v1" */
  versionCode: string;

  /** SHA-256 of the canonical JSON content (without the checksum field itself) */
  checksum?: string;

  /** Editorial lifecycle state — always forced to DRAFT on import */
  status?: EditorialStatus;

  nom: string;
  description?: string;

  objectif: string;   // maps to GymbroObjectif enum
  niveauMin: string;  // maps to GymbroNiveau enum
  niveauMax: string;
  seancesParSemaine: number;
  typeEquipement: string; // maps to GymbroTypeEquipement enum
  dureeSeanceMin: number;
  nbSemaines: number;

  prescriptionPolicy?: string;
  progressionPolicy?: string;
  maxSessionMinutes?: number;

  family?: ProgramFamily;

  blueprints: SessionBlueprint[];
  weeks: ProgramWeek[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationReport {
  valid: boolean;
  checksum: string;
  issues: ValidationIssue[];
  manifest?: ProgramManifest;
}
