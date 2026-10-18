/**
 * GymBro Program Catalog — Shared Contracts
 * Task 1: Freeze program catalog contracts and audit
 */

// ── Enum-like string unions ──────────────────────────────────────────────────

export type MatchStatus =
  | 'MATCHED'
  | 'NEEDS_CLARIFICATION'
  | 'NEEDS_COACH_REVIEW'
  | 'NEEDS_MEDICAL_REVIEW'
  | 'NO_COVERAGE';

export type EditorialStatus =
  | 'DRAFT'
  | 'COACH_REVIEW'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'RETIRED';

export type ProgressStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'EXCUSED';

export type Availability =
  | 'AVAILABLE'
  | 'LOCKED_PREREQUISITE'
  | 'LOCKED_SCHEDULE'
  | 'BLOCKED_SAFETY'
  | 'BLOCKED_ENTITLEMENT'
  | 'READ_ONLY';

/**
 * How the external load is measured/displayed for this exercise.
 *
 * TOTAL_EXTERNAL  – total bar/dumbbell weight (both dumbbells summed or full bar)
 * PER_DUMBBELL    – kg per dumbbell (never the sum)
 * MACHINE_DISPLAY – what the weight-stack indicator shows on this specific machine
 * ADDED_PLATES    – plates added beyond the sled/carriage (carriage weight tracked separately)
 * ASSISTANCE      – machine assistance kg (a higher value = easier, not heavier)
 * BAND_SETUP      – resistance band reference (brand/level/position, not kg)
 * BODYWEIGHT      – no external load; variante/support is the progression lever
 */
export type LoadConvention =
  | 'TOTAL_EXTERNAL'
  | 'PER_DUMBBELL'
  | 'MACHINE_DISPLAY'
  | 'ADDED_PLATES'
  | 'ASSISTANCE'
  | 'BAND_SETUP'
  | 'BODYWEIGHT';

export type EffortRating = 'EASY' | 'AS_EXPECTED' | 'HARD';

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  /** SHA-256 of canonical content (excludes editorial metadata fields). 64-char hex. */
  checksum: string;
}

// ── Prescription ─────────────────────────────────────────────────────────────

/**
 * Structured prescription for a single slot within a session.
 *
 * Cross-field consistency rules (enforced by validateProgramManifest):
 * - If metric === 'REPS':   durationMinSeconds and durationMaxSeconds MUST be null.
 * - If metric === 'DURATION': repsMin and repsMax MUST be null.
 * - If metric === 'DISTANCE': repsMin, repsMax, durationMinSeconds, durationMaxSeconds MUST be null.
 * - repsMin ≤ repsMax (when both non-null).
 * - durationMinSeconds ≤ durationMaxSeconds (when both non-null).
 * - restTargetSeconds ≥ 0.
 * - restAllowedMaxSeconds ≥ restTargetSeconds.
 * - initialLoadKg: null is always valid (calibrate on first session).
 */
export interface Prescription {
  metric: 'REPS' | 'DURATION' | 'DISTANCE';
  workingSets: number;
  repsMin: number | null;
  repsMax: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  distanceMinMeters: number | null;
  distanceMaxMeters: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  /** Canonical timer value. Must be ≥ 0. */
  restTargetSeconds: number;
  /** Allowed upper bound on rest. Must be ≥ restTargetSeconds. */
  restAllowedMaxSeconds: number;
  loadConvention: LoadConvention;
  /**
   * Starting load as a decimal string (e.g. "12.5") or null when unknown /
   * to be calibrated. Never a bare number — avoids floating-point ambiguity.
   */
  initialLoadKg: string | null;
}

// ── Exercise bindings ────────────────────────────────────────────────────────

/**
 * Maps an editorial exercise code to a specific media asset in the Flow catalog.
 * sourceId MUST be a 4-digit zero-padded string (e.g. '0289', not 289).
 */
export interface ExerciseBinding {
  exerciseCode: string;
  /** 4-digit zero-padded source identifier from catalog.json, e.g. '0289'. */
  sourceId: string;
  sourceRevision: string;
  reviewStatus: 'NEEDS_REVIEW' | 'VALIDATED' | 'REJECTED';
}

// ── Slot option ───────────────────────────────────────────────────────────────

export interface ProgramSlotOption {
  exerciseCode: string;
  /**
   * PRIMARY: default exercise for this slot.
   * A1: mechanically close substitute — new load calibration required.
   * A2: functionally similar but notable difference — reviewed constraints apply.
   * A3: partial coverage / function change — requires explicitly approved session variant.
   * Note: X (refused substitution) is a rule, not an option grade.
   */
  grade: 'PRIMARY' | 'A1' | 'A2' | 'A3';
  priority: number;
  approved: boolean;
  prescriptionOverride: Partial<Prescription>;
}

// ── Slot ─────────────────────────────────────────────────────────────────────

export interface ProgramExerciseSlot {
  slotCode: string;
  role: string;
  required: boolean;
  prescription: Prescription;
  options: ProgramSlotOption[];
}

// ── Session ──────────────────────────────────────────────────────────────────

export interface CompiledSession {
  /**
   * Stable occurrence identifier within the program, e.g. 'W03-H-A-1'.
   * Built during compilation; used as the ProgressionNode occurrence key.
   */
  occurrenceCode: string;
  /** Blueprint template code, e.g. 'H-A', 'D-B', 'CT-A'. */
  blueprintCode: string;
  sessionNumber: number;
  format: 'STANDARD' | 'CIRCUIT';
  slots: ProgramExerciseSlot[];
  /** Circuit format only: number of rounds. */
  rounds: number | null;
  /** Circuit format only: rest between exercises (seconds). */
  betweenExerciseRestSeconds: number | null;
  /** Circuit format only: rest between rounds (seconds). */
  betweenRoundRestSeconds: number | null;
  /** Estimated session duration including warm-up, sets, rest, and transitions. */
  estimatedSeconds: number;
  /** Actual chronometered duration (null until measured in a real gym). */
  measuredSeconds: number | null;
}

// ── Program manifest ─────────────────────────────────────────────────────────

export interface ProgramWeek {
  weekNumber: number;
  phaseNumber: number;
  sessions: CompiledSession[];
}

/**
 * Immutable editorial artifact for one program version.
 * durationWeeks MUST equal 12.
 * weeks MUST contain exactly 12 entries with weekNumber 1–12 (unique, sequential).
 */
export interface ProgramManifest {
  schemaVersion: 'gymbro-program-catalog/1';
  familyCode: string;
  versionCode: string;
  status: EditorialStatus;
  /** Always 12. Enforced by validateProgramManifest. */
  durationWeeks: 12;
  goalCoverage: string[];
  prescriptionPolicy: string;
  progressionPolicy: string;
  maxSessionMinutes: number;
  weeks: ProgramWeek[];
  /** Optional exercise bindings included in the manifest for validation. */
  exerciseBindings?: ExerciseBinding[];
  /** Optional family variant entries for duplicate-versionCode checks. */
  families?: Array<{ familyCode: string; versionCode: string; goalCoverage: string[] }>;
  /** Populated by the reviewer; excluded from checksum. */
  reviewedAt?: string;
  reviewAuthor?: string;
  publishedAt?: string;
  id?: string;
}

// ── Family definition ─────────────────────────────────────────────────────────

export interface FamilyDefinition {
  familyCode: string;
  variantCodes: string[];
  goalCoverage: string[];
  /**
   * 12 entries (one per week). Each entry is the ordered list of blueprint codes
   * for that week, e.g. ['D-A', 'D-B'].
   */
  weekBlueprints: string[][];
  prescriptionPolicy: string;
  progressionPolicy: string;
  maxSessionMinutes: number;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface NormalizedProfile {
  schemaVersion: 'gymbro-questionnaire/3';
  revision: number;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  primaryGoal: string | null;
  safetyStatus: MatchStatus;
  effectiveLevel: string | null;
  sessionsPerWeek: number | null;
  maxSessionMinutes: number | null;
  availableDays: number[];
  timezone: string;
}

// ── Equipment inventory ───────────────────────────────────────────────────────

export interface InventoryItem {
  equipmentId: string;
  equipmentType: string;
  state: 'AVAILABLE' | 'ABSENT' | 'BROKEN' | 'UNKNOWN';
  confidence: 'VERIFIED' | 'DECLARED';
  incrementKg: string | null;
  availableLoadsKg: string[];
  setupId: string | null;
}

export interface InventorySnapshot {
  id: string;
  revision: number;
  items: InventoryItem[];
}

// ── Slot resolution ───────────────────────────────────────────────────────────

export type SlotResolution =
  | {
      status: 'RESOLVED';
      exerciseCode: string;
      equipmentId: string | null;
      prescription: Prescription;
      alternativeExerciseCodes: string[];
      recalibrateLoad: boolean;
    }
  | {
      status: 'UNRESOLVED';
      reasonCodes: string[];
    };

export interface SubstitutionRequest {
  slot: ProgramExerciseSlot;
  profile: NormalizedProfile;
  inventory: InventorySnapshot;
  reason: 'ABSENT' | 'BROKEN' | 'BUSY' | 'UNKNOWN' | 'DISLIKED' | 'PAIN';
}

// ── Matching ──────────────────────────────────────────────────────────────────

export interface MatchingDecisionDto {
  status: MatchStatus;
  score: number | null;
  versionCode: string | null;
  reasonCodes: string[];
  rulesVersion: string;
}

// ── Progression ──────────────────────────────────────────────────────────────

export interface ProgressionNodeDto {
  id: string;
  assignmentId: string;
  sequence: number;
  weekNumber: number;
  phaseNumber: number;
  title: string;
  progressStatus: ProgressStatus;
  availability: Availability;
  reasonCode: string | null;
  reasonLabel: string | null;
  availableAt: string | null;
}

export interface ProgressionDto {
  assignmentId: string;
  revision: number;
  nodes: ProgressionNodeDto[];
  /** Includes EXCUSED nodes. */
  resolvedCount: number;
  /** COMPLETED only (does not include EXCUSED). */
  completedCount: number;
  totalCount: number;
  nextNodeId: string | null;
}

// ── Assignment nodes ──────────────────────────────────────────────────────────

export interface PlannedNode {
  id: string;
  occurrenceCode: string;
  sequence: number;
  weekNumber: number;
  prerequisiteNodeId: string | null;
  scheduledAt: string;
  minimumRecoverySeconds: number;
}

// ── Load progression ──────────────────────────────────────────────────────────

export interface ComparableExposure {
  userSessionId: string;
  exerciseCode: string;
  equipmentId: string | null;
  setupId: string | null;
  loadConvention: LoadConvention;
  performedAt: string;
  pain: boolean;
  techniqueConfirmed: boolean;
  sets: Array<{
    loadKg: string | null;
    reps: number | null;
    rir: number | null;
  }>;
}

export interface LoadProposal {
  action: 'CALIBRATE' | 'HOLD' | 'INCREASE' | 'DECREASE' | 'REVIEW';
  value: string | null;
  loadConvention: LoadConvention;
  reasonCode: string;
}
