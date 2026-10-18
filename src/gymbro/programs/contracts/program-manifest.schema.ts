/**
 * GymBro Program Catalog — Manifest Validator
 * Task 1: Freeze program catalog contracts and audit
 *
 * Pure function — no Prisma, no HTTP, no side effects.
 */

import { createHash } from 'node:crypto';
import type {
  ValidationReport,
  ValidationIssue,
  ProgramManifest,
  Prescription,
  ExerciseBinding,
} from './program-contracts';

// ── Internal helpers ──────────────────────────────────────────────────────────

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || isNumber(v);
}

/**
 * Build a canonical JSON for checksum purposes.
 * Excludes fields that change with editorial workflow but not content:
 *   status, id, reviewedAt, publishedAt, reviewAuthor
 */
function canonicalize(input: Record<string, unknown>): string {
  const EXCLUDED_KEYS = new Set(['status', 'id', 'reviewedAt', 'publishedAt', 'reviewAuthor']);

  function sortedCopy(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sortedCopy);
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .filter(k => !EXCLUDED_KEYS.has(k))
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortedCopy(obj[k]);
        return acc;
      }, {});
  }

  return JSON.stringify(sortedCopy(input));
}

function computeChecksum(input: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}

// ── Prescription validator ────────────────────────────────────────────────────

function validatePrescription(p: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (p === null || typeof p !== 'object') {
    issues.push(issue('INVALID_PRESCRIPTION', basePath, 'prescription must be an object'));
    return;
  }
  const presc = p as Record<string, unknown>;

  const metric = presc['metric'];
  if (!['REPS', 'DURATION', 'DISTANCE'].includes(metric as string)) {
    issues.push(issue('INVALID_METRIC', `${basePath}.metric`,
      `metric must be REPS, DURATION, or DISTANCE; got ${metric}`));
  }

  // workingSets
  if (!isNumber(presc['workingSets']) || (presc['workingSets'] as number) < 1) {
    issues.push(issue('INVALID_SETS', `${basePath}.workingSets`, 'workingSets must be a positive number'));
  }

  // metric-specific cross-field rules
  if (metric === 'REPS') {
    if (presc['durationMinSeconds'] !== null && presc['durationMinSeconds'] !== undefined) {
      issues.push(issue('SECONDS_IN_REPS_PRESCRIPTION', `${basePath}.durationMinSeconds`,
        'durationMinSeconds must be null when metric is REPS'));
    }
    if (presc['durationMaxSeconds'] !== null && presc['durationMaxSeconds'] !== undefined) {
      issues.push(issue('SECONDS_IN_REPS_PRESCRIPTION', `${basePath}.durationMaxSeconds`,
        'durationMaxSeconds must be null when metric is REPS'));
    }
    // repsMin ≤ repsMax
    const rMin = presc['repsMin'];
    const rMax = presc['repsMax'];
    if (rMin !== null && rMax !== null && isNumber(rMin) && isNumber(rMax)) {
      if (rMin > rMax) {
        issues.push(issue('INVERTED_REPS', `${basePath}.repsMin`,
          `repsMin (${rMin}) must be ≤ repsMax (${rMax})`));
      }
    }
  }

  if (metric === 'DURATION') {
    if (presc['repsMin'] !== null && presc['repsMin'] !== undefined) {
      issues.push(issue('REPS_IN_DURATION_PRESCRIPTION', `${basePath}.repsMin`,
        'repsMin must be null when metric is DURATION'));
    }
    if (presc['repsMax'] !== null && presc['repsMax'] !== undefined) {
      issues.push(issue('REPS_IN_DURATION_PRESCRIPTION', `${basePath}.repsMax`,
        'repsMax must be null when metric is DURATION'));
    }
    const dMin = presc['durationMinSeconds'];
    const dMax = presc['durationMaxSeconds'];
    if (dMin !== null && dMax !== null && isNumber(dMin) && isNumber(dMax) && dMin > dMax) {
      issues.push(issue('INVERTED_DURATION', `${basePath}.durationMinSeconds`,
        `durationMinSeconds (${dMin}) must be ≤ durationMaxSeconds (${dMax})`));
    }
  }

  // restTargetSeconds ≥ 0
  const restTarget = presc['restTargetSeconds'];
  if (!isNumber(restTarget) || (restTarget as number) < 0) {
    issues.push(issue('NEGATIVE_REST', `${basePath}.restTargetSeconds`,
      `restTargetSeconds must be ≥ 0; got ${restTarget}`));
  }

  // restAllowedMaxSeconds ≥ restTargetSeconds
  const restMax = presc['restAllowedMaxSeconds'];
  if (isNumber(restTarget) && (restTarget as number) >= 0) {
    if (!isNumber(restMax) || (restMax as number) < (restTarget as number)) {
      issues.push(issue('INVALID_REST_MAX', `${basePath}.restAllowedMaxSeconds`,
        `restAllowedMaxSeconds must be ≥ restTargetSeconds (${restTarget}); got ${restMax}`));
    }
  }

  // initialLoadKg: null is always valid; if present, must be string or null
  const loadKg = presc['initialLoadKg'];
  if (loadKg !== null && loadKg !== undefined && typeof loadKg !== 'string') {
    issues.push(issue('INVALID_LOAD_FORMAT', `${basePath}.initialLoadKg`,
      'initialLoadKg must be a decimal string or null'));
  }
}

// ── ExerciseBinding validator ─────────────────────────────────────────────────

function validateExerciseBindings(
  bindings: unknown,
  basePath: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(bindings)) return; // optional field

  bindings.forEach((binding, idx) => {
    if (binding === null || typeof binding !== 'object') return;
    const b = binding as Record<string, unknown>;
    const sourceId = b['sourceId'];

    if (typeof sourceId !== 'string') {
      issues.push(issue('INVALID_SOURCE_ID_TYPE', `${basePath}.${idx}.sourceId`,
        `sourceId must be a string (e.g. '0289'), not ${typeof sourceId}`));
    } else if (!/^[0-9]{4}$/.test(sourceId)) {
      issues.push(issue('INVALID_SOURCE_ID_FORMAT', `${basePath}.${idx}.sourceId`,
        `sourceId must be a 4-digit string (e.g. '0289'); got '${sourceId}'`));
    }
  });
}

// ── Families validator (duplicate versionCode check) ─────────────────────────

function validateFamilies(
  families: unknown,
  basePath: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(families)) return; // optional field

  // Group by familyCode and check for duplicate versionCode within same family
  const byFamily = new Map<string, Set<string>>();

  families.forEach((fam, idx) => {
    if (fam === null || typeof fam !== 'object') return;
    const f = fam as Record<string, unknown>;
    const familyCode = String(f['familyCode'] ?? '');
    const versionCode = String(f['versionCode'] ?? '');

    if (!byFamily.has(familyCode)) {
      byFamily.set(familyCode, new Set());
    }
    const seen = byFamily.get(familyCode)!;
    if (seen.has(versionCode)) {
      issues.push(issue('DUPLICATE_VERSION_CODE', `${basePath}.${idx}.versionCode`,
        `versionCode '${versionCode}' is duplicated within family '${familyCode}'`));
    }
    seen.add(versionCode);
  });
}

// ── Slot validator ────────────────────────────────────────────────────────────

function validateSlot(slot: unknown, path: string, issues: ValidationIssue[]): void {
  if (slot === null || typeof slot !== 'object') {
    issues.push(issue('INVALID_SLOT', path, 'slot must be an object'));
    return;
  }
  const s = slot as Record<string, unknown>;

  if (!isString(s['slotCode'])) {
    issues.push(issue('MISSING_SLOT_CODE', `${path}.slotCode`, 'slotCode is required'));
  }

  validatePrescription(s['prescription'], `${path}.prescription`, issues);

  if (Array.isArray(s['options'])) {
    (s['options'] as unknown[]).forEach((opt, oi) => {
      if (opt === null || typeof opt !== 'object') return;
      const o = opt as Record<string, unknown>;
      if (!['PRIMARY', 'A1', 'A2', 'A3'].includes(String(o['grade']))) {
        issues.push(issue('INVALID_GRADE', `${path}.options.${oi}.grade`,
          `grade must be PRIMARY, A1, A2, or A3; got '${o['grade']}'`));
      }
      if (o['prescriptionOverride'] && typeof o['prescriptionOverride'] === 'object') {
        // partial override — only validate the fields that are present
        const ov = o['prescriptionOverride'] as Record<string, unknown>;
        if ('restTargetSeconds' in ov) {
          const rt = ov['restTargetSeconds'];
          if (isNumber(rt) && (rt as number) < 0) {
            issues.push(issue('NEGATIVE_REST', `${path}.options.${oi}.prescriptionOverride.restTargetSeconds`,
              'restTargetSeconds must be ≥ 0'));
          }
        }
      }
    });
  }
}

// ── Session validator ─────────────────────────────────────────────────────────

function validateSession(session: unknown, path: string, issues: ValidationIssue[]): void {
  if (session === null || typeof session !== 'object') {
    issues.push(issue('INVALID_SESSION', path, 'session must be an object'));
    return;
  }
  const s = session as Record<string, unknown>;

  if (!isString(s['occurrenceCode'])) {
    issues.push(issue('MISSING_OCCURRENCE_CODE', `${path}.occurrenceCode`, 'occurrenceCode is required'));
  }
  if (!isString(s['blueprintCode'])) {
    issues.push(issue('MISSING_BLUEPRINT_CODE', `${path}.blueprintCode`, 'blueprintCode is required'));
  }
  if (!['STANDARD', 'CIRCUIT'].includes(String(s['format']))) {
    issues.push(issue('INVALID_FORMAT', `${path}.format`,
      `format must be STANDARD or CIRCUIT; got '${s['format']}'`));
  }

  if (Array.isArray(s['slots'])) {
    (s['slots'] as unknown[]).forEach((slot, si) => {
      validateSlot(slot, `${path}.slots.${si}`, issues);
    });
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function validateProgramManifest(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  const checksum = computeChecksum(
    (input !== null && typeof input === 'object' ? input : {}) as Record<string, unknown>,
  );

  if (input === null || typeof input !== 'object') {
    issues.push(issue('NOT_AN_OBJECT', '', 'manifest must be a non-null object'));
    return { valid: false, issues, checksum };
  }

  const manifest = input as Record<string, unknown>;

  // schemaVersion
  if (manifest['schemaVersion'] !== 'gymbro-program-catalog/1') {
    issues.push(issue('INVALID_SCHEMA_VERSION', 'schemaVersion',
      `schemaVersion must be 'gymbro-program-catalog/1'; got '${manifest['schemaVersion']}'`));
  }

  // durationWeeks
  if (manifest['durationWeeks'] !== 12) {
    issues.push(issue('INVALID_DURATION_WEEKS', 'durationWeeks',
      `durationWeeks must be exactly 12; got ${manifest['durationWeeks']}`));
  }

  // weeks array
  const weeks = manifest['weeks'];
  if (!Array.isArray(weeks)) {
    issues.push(issue('MISSING_WEEKS', 'weeks', 'weeks must be an array'));
  } else {
    if (weeks.length !== 12) {
      issues.push(issue('WRONG_WEEK_COUNT', 'weeks',
        `weeks must have exactly 12 entries; got ${weeks.length}`));
    }

    // weekNumber uniqueness and range
    const weekNumbers = new Set<number>();
    weeks.forEach((week, wi) => {
      if (week === null || typeof week !== 'object') {
        issues.push(issue('INVALID_WEEK', `weeks.${wi}`, 'week must be an object'));
        return;
      }
      const w = week as Record<string, unknown>;
      const wn = w['weekNumber'];
      if (!isNumber(wn)) {
        issues.push(issue('INVALID_WEEK_NUMBER', `weeks.${wi}.weekNumber`, 'weekNumber must be a number'));
      } else {
        if (weekNumbers.has(wn as number)) {
          issues.push(issue('DUPLICATE_WEEK_NUMBER', `weeks.${wi}.weekNumber`,
            `weekNumber ${wn} is duplicated`));
        }
        weekNumbers.add(wn as number);
        if ((wn as number) < 1 || (wn as number) > 12) {
          issues.push(issue('OUT_OF_RANGE_WEEK_NUMBER', `weeks.${wi}.weekNumber`,
            `weekNumber must be between 1 and 12; got ${wn}`));
        }
      }

      if (Array.isArray(w['sessions'])) {
        (w['sessions'] as unknown[]).forEach((session, si) => {
          validateSession(session, `weeks.${wi}.sessions.${si}`, issues);
        });
      }
    });
  }

  // optional: exerciseBindings
  if ('exerciseBindings' in manifest && manifest['exerciseBindings'] !== undefined) {
    validateExerciseBindings(manifest['exerciseBindings'], 'exerciseBindings', issues);
  }

  // optional: families (duplicate versionCode check)
  if ('families' in manifest && manifest['families'] !== undefined) {
    validateFamilies(manifest['families'], 'families', issues);
  }

  return {
    valid: issues.length === 0,
    issues,
    checksum,
  };
}
