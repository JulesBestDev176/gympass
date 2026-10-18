import type { MatchingDecisionDto, MatchStatus } from '../programs/contracts/program-contracts';

export interface PublishedVersion {
  id: string;
  versionCode: string;
  familyCode: string;
  goalCoverage: string[];
  sessionsPerWeek: number;
  maxSessionMinutes: number;
  prescriptionPolicy: string;
  progressionPolicy: string;
}

/**
 * V3 profile fields derived from flattenV3() and questionnaire step data.
 * This is a superset of the legacy NormalizedProfile — read-only for the engine.
 */
export interface V3NormalizedProfile {
  userId: string;
  safetyStatus: 'CLEAREDFORSTANDARDONBOARDING' | 'NEEDSEXERCISEMODIFICATION' | 'NEEDSMEDICALREVIEW';
  trainingLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  primaryGoal?: string;          // e.g. 'PRISE_MUSCLE', 'PERTE_GRAISSE', 'FORCE', 'FORME_GENERALE'
  sessionsPerWeek?: number | null;
  primaryTrainingLocation?: string;
  trainingLocations?: string[];
  availableEquipment?: string[];
  maxSessionMinutes?: number | null;
}

export const RULES_VERSION = 'gymbro-matching/1.0.0';

// Families that are for domicile / plein-air training
const DOMICILE_FAMILIES = new Set(['P18', 'P19', 'P20']);

// Families requiring barbell (rack + barre_disques)
const BARBELL_FAMILIES = new Set(['P33', 'P34', 'P35']);

// Level ranges for scoring bonus
const BEGINNER_RANGE = { min: 1, max: 12 };
const INTERMEDIATE_RANGE = { min: 13, max: 25 };
const ADVANCED_RANGE = { min: 26, max: 37 };

function parseFamilyNumber(familyCode: string): number {
  const match = familyCode.match(/^P(\d+)$/);
  return match ? parseInt(match[1], 10) : 999;
}

function levelMatchesFamily(level: string, familyCode: string): boolean {
  const num = parseFamilyNumber(familyCode);
  if (level === 'BEGINNER') return num >= BEGINNER_RANGE.min && num <= BEGINNER_RANGE.max;
  if (level === 'INTERMEDIATE') return num >= INTERMEDIATE_RANGE.min && num <= INTERMEDIATE_RANGE.max;
  if (level === 'ADVANCED') return num >= ADVANCED_RANGE.min && num <= ADVANCED_RANGE.max;
  return false;
}

function preferredVariant(equipment: string[]): 'L' | 'M' | 'BARBELL' {
  const eq = equipment.map(e => e.toUpperCase());
  if (eq.includes('BARRE_DISQUES') && eq.includes('RACK')) return 'BARBELL';
  if (!eq.includes('BARRE_DISQUES') && !eq.some(e => e.includes('HALT') || e === 'HALTERES') && eq.some(e => e === 'MACHINES')) {
    return 'M';
  }
  return 'L';
}

function getVersionVariant(versionCode: string): string {
  // versionCode format: P01-L-v1 or P01-M-v1
  const parts = versionCode.split('-');
  return parts.length >= 2 ? parts[1] : '';
}

export function matchProgram(
  profile: V3NormalizedProfile,
  publishedVersions: PublishedVersion[],
): MatchingDecisionDto {
  // ── 1. Safety gate ──────────────────────────────────────────────────────────
  if (profile.safetyStatus === 'NEEDSMEDICALREVIEW') {
    return {
      status: 'NEEDS_MEDICAL_REVIEW',
      score: null,
      versionCode: null,
      reasonCodes: ['MEDICAL_REVIEW_REQUIRED'],
      rulesVersion: RULES_VERSION,
    };
  }

  // ── 2. Completeness check ────────────────────────────────────────────────────
  const missingFields: string[] = [];
  if (profile.sessionsPerWeek === null || profile.sessionsPerWeek === undefined) {
    missingFields.push('MISSING_SESSIONS_PER_WEEK');
  }
  const hasLocation =
    (profile.primaryTrainingLocation && profile.primaryTrainingLocation.length > 0) ||
    (profile.trainingLocations && profile.trainingLocations.length > 0);
  if (!hasLocation) {
    missingFields.push('MISSING_TRAINING_LOCATION');
  }
  if (!profile.safetyStatus) {
    missingFields.push('MISSING_SAFETY_STATUS');
  }
  if (missingFields.length > 0) {
    return {
      status: 'NEEDS_CLARIFICATION',
      score: null,
      versionCode: null,
      reasonCodes: missingFields,
      rulesVersion: RULES_VERSION,
    };
  }

  // ── 3. Filter by location ────────────────────────────────────────────────────
  const location = profile.primaryTrainingLocation ??
    (profile.trainingLocations && profile.trainingLocations[0]);

  let eligible = publishedVersions.filter(v => {
    const fnum = parseFamilyNumber(v.familyCode);
    if (location === 'DOMICILE') {
      return DOMICILE_FAMILIES.has(v.familyCode);
    } else if (location === 'SALLE') {
      return !DOMICILE_FAMILIES.has(v.familyCode);
    }
    // PLEIN_AIR, STADE, etc. — all eligible
    return true;
  });

  // ── 4. Filter/prefer by equipment ────────────────────────────────────────────
  const equipment = profile.availableEquipment ?? [];
  const variant = preferredVariant(equipment);

  if (variant === 'BARBELL') {
    // Prefer barbell families; if none, keep all
    const barbell = eligible.filter(v => BARBELL_FAMILIES.has(v.familyCode));
    if (barbell.length > 0) eligible = barbell;
  }

  // ── 5. Published versions check ──────────────────────────────────────────────
  if (eligible.length === 0) {
    return {
      status: 'NO_COVERAGE',
      score: null,
      versionCode: null,
      reasonCodes: ['NO_ELIGIBLE_VERSION'],
      rulesVersion: RULES_VERSION,
    };
  }

  // ── 6. Score each eligible version ───────────────────────────────────────────
  const sessionsPerWeek = profile.sessionsPerWeek!;

  const scored = eligible.map(v => {
    let score = 0;

    // sessionsPerWeek match
    score += 10 - Math.abs(sessionsPerWeek - v.sessionsPerWeek) * 3;

    // maxSessionMinutes match
    if (profile.maxSessionMinutes != null) {
      if (Math.abs(profile.maxSessionMinutes - v.maxSessionMinutes) <= 15) {
        score += 5;
      }
    }

    // Level match
    if (levelMatchesFamily(profile.trainingLevel, v.familyCode)) {
      score += 8;
    } else {
      score -= 3;
    }

    // Goal match
    if (profile.primaryGoal && v.goalCoverage.includes(profile.primaryGoal)) {
      score += 10;
    }

    // Variant match
    const vVariant = getVersionVariant(v.versionCode);
    if (variant === 'M' && vVariant === 'M') score += 3;
    if (variant === 'L' && vVariant === 'L') score += 3;
    if (variant === 'BARBELL' && vVariant === 'L') score += 3; // barbell uses L variant

    return { version: v, score };
  });

  // ── 7. Pick highest score — tie-break by lower familyCode number ──────────────
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return parseFamilyNumber(a.version.familyCode) - parseFamilyNumber(b.version.familyCode);
  });

  const best = scored[0];

  if (!best || best.score < 0) {
    // Edge case: all versions have negative scores → still return best match
    // (per spec, only NO_COVERAGE when list is empty)
  }

  return {
    status: 'MATCHED',
    score: best.score,
    versionCode: best.version.versionCode,
    reasonCodes: [],
    rulesVersion: RULES_VERSION,
  };
}
