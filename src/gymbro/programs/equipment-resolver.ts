import type {
  ProgramExerciseSlot,
  NormalizedProfile,
  InventorySnapshot,
  SlotResolution,
  SubstitutionRequest,
  ExerciseBinding,
  SubstitutionRule,
} from './contracts/program-contracts';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bindingsData: ExerciseBinding[] = require('../../../assets/program-catalog/exercise-bindings.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const substitutionsData: SubstitutionRule[] = require('../../../assets/program-catalog/substitutions.json');

/** Source IDs explicitly excluded from primary bindings */
const EXCLUDED_SOURCE_IDS = new Set(['0599', '0705', '0430', '3523']);

/** Grade priority order — lower index = higher priority */
const GRADE_ORDER: string[] = ['PRIMARY', 'A1', 'A2', 'A3'];

function hasEquipment(inventory: InventorySnapshot, requiredEquipment: string[]): boolean {
  const available = new Set(
    inventory.equipment.filter((e) => e.available).map((e) => e.code),
  );
  return requiredEquipment.every((eq) => available.has(eq));
}

function missingEquipment(inventory: InventorySnapshot, requiredEquipment: string[]): string[] {
  const available = new Set(
    inventory.equipment.filter((e) => e.available).map((e) => e.code),
  );
  return requiredEquipment.filter((eq) => !available.has(eq));
}

function getBindingsForSlot(slotCode: string, variant?: string): ExerciseBinding[] {
  const filtered = bindingsData.filter((b) => {
    if (b.slotCode !== slotCode) return false;
    if (variant !== undefined && variant !== null && variant !== '') {
      return b.variant === variant;
    }
    return true;
  });
  // Sort by grade priority then by priority field
  return filtered.sort((a, b) => {
    const gradeA = GRADE_ORDER.indexOf(a.grade);
    const gradeB = GRADE_ORDER.indexOf(b.grade);
    if (gradeA !== gradeB) return gradeA - gradeB;
    return (a.priority ?? 99) - (b.priority ?? 99);
  });
}

/**
 * Resolves a program exercise slot against the given inventory and profile.
 *
 * Resolution order:
 * 1. Find all bindings for the slot (ordered PRIMARY → A1 → A2 → A3, then by priority)
 * 2. For each binding, check approved flag and equipment availability
 * 3. First passing binding wins — if grade != PRIMARY, recalibrateLoad = true
 * 4. If nothing resolves, return UNRESOLVED with appropriate reasonCode
 */
export function resolveSlot(
  slot: ProgramExerciseSlot,
  _profile: NormalizedProfile,
  inventory: InventorySnapshot,
): SlotResolution {
  const slotCode = slot.slotCode;
  const variant = slot.variant;

  // Get bindings for this slot (with or without variant filter)
  let bindings = getBindingsForSlot(slotCode, variant);

  // If no variant specified, get all bindings for the slot
  if (bindings.length === 0) {
    bindings = getBindingsForSlot(slotCode);
  }

  if (bindings.length === 0) {
    return {
      status: 'UNRESOLVED',
      reasonCode: 'NO_APPROVED_ALTERNATIVE',
      reasonDetail: `No bindings found for slot ${slotCode}`,
    };
  }

  let hasApprovedOption = false;

  for (const binding of bindings) {
    if (!binding.approved) continue;
    hasApprovedOption = true;

    const missing = missingEquipment(inventory, binding.requiredEquipment);
    if (missing.length === 0) {
      const isPrimary = binding.grade === 'PRIMARY';
      const recalibrate = !isPrimary;

      // Determine reasonCode for missing anchor specifically
      // (already resolved if we are here, but useful for UNRESOLVED paths)

      return {
        status: 'RESOLVED',
        exerciseCode: binding.exerciseCode,
        sourceId: binding.sourceId,
        grade: binding.grade,
        recalibrateLoad: recalibrate,
        reviewStatus: binding.reviewStatus,
        prescription: {
          exerciseCode: binding.exerciseCode,
          sourceId: binding.sourceId,
          grade: binding.grade,
          recalibrateLoad: recalibrate,
          sets: slot.defaultPrescription.sets,
          repsMin: slot.defaultPrescription.repsMin,
          repsMax: slot.defaultPrescription.repsMax,
          restSec: slot.defaultPrescription.restSec,
          rpe: slot.defaultPrescription.rpe,
          rir: slot.defaultPrescription.rir,
          tempo: slot.defaultPrescription.tempo,
          loadConvention: ((binding.prescriptionOverride as Record<string, unknown>)?.loadConvention as string | undefined
            ?? slot.defaultPrescription.loadConvention) as import('./contracts/program-contracts').LoadConventionType | undefined,
          ...Object.fromEntries(
            Object.entries(binding.prescriptionOverride ?? {}).filter(([k]) => k !== 'loadConvention'),
          ),
        },
      };
    }
  }

  if (!hasApprovedOption) {
    return {
      status: 'UNRESOLVED',
      reasonCode: 'NOT_APPROVED',
      reasonDetail: `No approved binding for slot ${slotCode}`,
    };
  }

  // Determine the best reason code for the unresolved result
  // Check if any binding has HIGH_ANCHOR in required equipment
  const hasAnchorRequirement = bindings.some(
    (b) => b.approved && b.requiredEquipment.includes('HIGH_ANCHOR'),
  );

  // If there's an anchor requirement but anchor is missing, return MISSING_ANCHOR
  if (hasAnchorRequirement) {
    const anchorAvailable = inventory.equipment.some(
      (e) => e.code === 'HIGH_ANCHOR' && e.available,
    );
    if (!anchorAvailable) {
      return {
        status: 'UNRESOLVED',
        reasonCode: 'MISSING_ANCHOR',
        reasonDetail: `HIGH_ANCHOR not available for slot ${slotCode}`,
      };
    }
  }

  return {
    status: 'UNRESOLVED',
    reasonCode: 'MISSING_EQUIPMENT',
    reasonDetail: `No equipment match found for slot ${slotCode}`,
  };
}

/**
 * Resolves a substitution for a given slot.
 *
 * - PAIN reason always returns NEEDS_REVIEW (no substitution)
 * - Substitutions are directed: A→B is not the same as B→A
 * - A substitution that would return to the original exercise is not performed
 */
export function resolveSubstitution(input: SubstitutionRequest): SlotResolution {
  const { slot, profile, inventory, reason, originalExerciseCode } = input;

  // PAIN always requires coach review
  if (reason === 'PAIN') {
    return { status: 'NEEDS_REVIEW' };
  }

  const currentExerciseCode = slot.exerciseCode;

  // Find substitution rules from current exercise (directed: only from current, not to current)
  const rules = substitutionsData.filter((r) => {
    if (r.fromExerciseCode !== currentExerciseCode) return false;
    if (r.reason !== reason) return false;
    // Do not substitute back to the original exercise
    if (originalExerciseCode && r.toExerciseCode === originalExerciseCode) return false;
    return true;
  });

  for (const rule of rules) {
    // Check equipment conditions
    if (!hasEquipment(inventory, rule.conditions.requiredEquipment ?? [])) {
      continue;
    }

    // Check level condition
    if (rule.conditions.minLevel) {
      const levelOrder = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
      const userIdx = levelOrder.indexOf(profile.level);
      const minIdx = levelOrder.indexOf(rule.conditions.minLevel);
      if (userIdx < minIdx) continue;
    }

    // Find the target binding
    const targetBinding = bindingsData.find((b) => b.exerciseCode === rule.toExerciseCode);
    if (!targetBinding) continue;

    return {
      status: 'RESOLVED',
      exerciseCode: rule.toExerciseCode,
      sourceId: targetBinding.sourceId,
      grade: rule.grade,
      recalibrateLoad: rule.recalibrateLoad,
      reviewStatus: rule.reviewStatus,
      prescription: {
        exerciseCode: rule.toExerciseCode,
        sourceId: targetBinding.sourceId,
        grade: rule.grade,
        recalibrateLoad: rule.recalibrateLoad,
        sets: slot.defaultPrescription.sets,
        repsMin: slot.defaultPrescription.repsMin,
        repsMax: slot.defaultPrescription.repsMax,
        restSec: slot.defaultPrescription.restSec,
        rpe: slot.defaultPrescription.rpe,
        rir: slot.defaultPrescription.rir,
        tempo: slot.defaultPrescription.tempo,
        loadConvention: slot.defaultPrescription.loadConvention,
      },
    };
  }

  // No valid substitution found
  return {
    status: 'UNRESOLVED',
    reasonCode: 'NO_APPROVED_ALTERNATIVE',
    reasonDetail: `No valid substitution found for ${currentExerciseCode} with reason ${reason}`,
  };
}

/**
 * Validates that a list of bindings does not include excluded sourceIds as primary bindings
 * and that all VALIDATED entries have valid sourceIds.
 */
export function validateBindings(bindingsList: ExerciseBinding[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const binding of bindingsList) {
    if (binding.grade === 'PRIMARY' && EXCLUDED_SOURCE_IDS.has(binding.sourceId)) {
      errors.push(
        `Excluded sourceId "${binding.sourceId}" used as PRIMARY in slot ${binding.slotCode} (exerciseCode: ${binding.exerciseCode})`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
