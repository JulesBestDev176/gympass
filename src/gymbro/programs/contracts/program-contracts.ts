// Program catalog contracts — shared types for slot resolution, substitutions, prescriptions
// Generated for GymBro program catalog implementation

export type SlotGrade = 'PRIMARY' | 'A1' | 'A2' | 'A3';
export type ReviewStatus = 'VALIDATED' | 'NEEDS_REVIEW';
export type SubstitutionReason = 'ABSENT' | 'PAIN' | 'FATIGUE' | 'PREFERENCE';
export type LoadConventionType =
  | 'TOTAL_EXTERNAL'    // barbell total load (FS, FB, FR)
  | 'PER_DUMBBELL'      // load per dumbbell (HP-L)
  | 'MACHINE_DISPLAY'   // weight shown on machine stack (HP-M, VR-M)
  | 'BODYWEIGHT'        // body weight (AE, AL, BW slots)
  | 'PERCENTAGE_1RM';   // percentage of 1RM

export interface LoadConventionDetails {
  type: LoadConventionType;
  unit: 'kg' | 'lbs' | 'percent';
  displayLabel: string;
}

export interface PrescriptionBase {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  rpe?: number;           // Rate of Perceived Exertion 1-10
  rir?: number;           // Reps In Reserve
  tempo?: string;         // e.g. "3-1-1-0"
  loadConvention?: LoadConventionType;
}

export type Prescription = PrescriptionBase & {
  exerciseCode: string;
  sourceId: string;
  grade: SlotGrade;
  recalibrateLoad: boolean;
};

export interface ProgramExerciseSlot {
  slotCode: string;        // e.g. "HP", "VR", "FS"
  variant?: string;        // e.g. "L", "M", "BW", "EL"
  exerciseCode: string;    // e.g. "HP-L-PRIMARY"
  sessionPosition: number; // order within session
  defaultPrescription: PrescriptionBase;
}

export interface EquipmentItem {
  code: string;   // e.g. "DUMBBELLS", "RACK", "BARBELL"
  available: boolean;
}

export interface InventorySnapshot {
  gymId?: string;
  userId?: string;
  equipment: EquipmentItem[];
  snapshotAt: string; // ISO date
}

export interface NormalizedProfile {
  userId: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  goal: 'STRENGTH' | 'HYPERTROPHY' | 'ENDURANCE' | 'RECOMPOSITION' | 'WEIGHT_LOSS';
  daysPerWeek: number;
  excludedMuscleGroups?: string[];
  injuries?: string[];
}

export type ReasonCode =
  | 'MISSING_EQUIPMENT'
  | 'MISSING_ANCHOR'
  | 'NO_APPROVED_ALTERNATIVE'
  | 'EXCLUDED_SOURCE_ID'
  | 'NEEDS_COACH_REVIEW'
  | 'NOT_APPROVED';

export interface SlotResolution {
  status: 'RESOLVED' | 'UNRESOLVED' | 'NEEDS_REVIEW';
  exerciseCode?: string;
  sourceId?: string;
  grade?: SlotGrade;
  prescription?: Prescription;
  recalibrateLoad?: boolean;
  reasonCode?: ReasonCode;
  reasonDetail?: string;
  reviewStatus?: ReviewStatus;
}

export interface SubstitutionRequest {
  slot: ProgramExerciseSlot;
  profile: NormalizedProfile;
  inventory: InventorySnapshot;
  reason: SubstitutionReason;
  originalExerciseCode?: string; // prevents reverse substitution
}

export interface ExerciseBinding {
  slotCode: string;
  exerciseCode: string;
  sourceId: string;
  sourceRevision: string;
  grade: SlotGrade;
  variant: string;
  requiredEquipment: string[];
  approved: boolean;
  reviewStatus: ReviewStatus;
  prescriptionOverride: Partial<PrescriptionBase>;
  priority?: number;
}

export interface SubstitutionRule {
  fromExerciseCode: string;
  toExerciseCode: string;
  grade: SlotGrade;
  reason: SubstitutionReason;
  conditions: {
    requiredEquipment?: string[];
    minLevel?: string;
  };
  recalibrateLoad: boolean;
  reviewStatus: ReviewStatus;
}

export interface InventoryValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Editorial / manifest types (Task 1) ──────────────────────────────────────

export type EditorialStatus = 'DRAFT' | 'COACH_REVIEW' | 'VALIDATED' | 'PUBLISHED' | 'RETIRED';
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCUSED';
export type Availability =
  | 'AVAILABLE'
  | 'LOCKED_PREREQUISITE'
  | 'LOCKED_SCHEDULE'
  | 'BLOCKED_SAFETY'
  | 'BLOCKED_ENTITLEMENT'
  | 'READ_ONLY';
export type LoadConvention =
  | 'TOTAL_EXTERNAL'
  | 'PER_DUMBBELL'
  | 'MACHINE_DISPLAY'
  | 'ADDED_PLATES'
  | 'ASSISTANCE'
  | 'BAND_SETUP'
  | 'BODYWEIGHT';
export type EffortRating = 'EASY' | 'AS_EXPECTED' | 'HARD';
export type MatchStatus =
  | 'MATCHED'
  | 'NEEDS_CLARIFICATION'
  | 'NEEDS_COACH_REVIEW'
  | 'NEEDS_MEDICAL_REVIEW'
  | 'NO_COVERAGE';

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  checksum: string;
}

export interface CompiledSession {
  occurrenceCode: string;
  blueprintCode: string;
  sessionNumber: number;
  format: 'STANDARD' | 'CIRCUIT';
  slots: ProgramExerciseSlot[];
  rounds: number | null;
  betweenExerciseRestSeconds: number | null;
  betweenRoundRestSeconds: number | null;
  estimatedSeconds: number;
  measuredSeconds: number | null;
}

export interface ProgramManifest {
  schemaVersion: 'gymbro-program-catalog/1';
  familyCode: string;
  versionCode: string;
  status: EditorialStatus;
  durationWeeks: 12;
  goalCoverage: string[];
  prescriptionPolicy: string;
  progressionPolicy: string;
  maxSessionMinutes: number;
  weeks: { weekNumber: number; phaseNumber: number; sessions: CompiledSession[] }[];
}

export interface FamilyDefinition {
  familyCode: string;
  variantCodes: string[];
  goalCoverage: string[];
  weekBlueprints: string[][];
  prescriptionPolicy: string;
  progressionPolicy: string;
  maxSessionMinutes: number;
}

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
  resolvedCount: number;
  completedCount: number;
  totalCount: number;
  nextNodeId: string | null;
}

export interface MatchingDecisionDto {
  status: MatchStatus;
  score: number | null;
  versionCode: string | null;
  reasonCodes: string[];
  rulesVersion: string;
}

export interface LoadProposal {
  action: 'CALIBRATE' | 'HOLD' | 'INCREASE' | 'DECREASE' | 'REVIEW';
  value: string | null;
  loadConvention: LoadConvention;
  reasonCode: string;
}

export interface PlannedNode {
  id: string;
  occurrenceCode: string;
  sequence: number;
  weekNumber: number;
  prerequisiteNodeId: string | null;
  scheduledAt: string;
  minimumRecoverySeconds: number;
}
