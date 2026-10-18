import * as crypto from 'crypto';
import type { ProgramManifest, ValidationReport, ValidationIssue } from './program-contracts';

// ─────────────────────────── CONSTANTS ───────────────────────────────────────

const VALID_OBJECTIFS = ['PRISE_DE_MASSE', 'FORCE', 'REMISE_EN_FORME', 'AUTRE'];
const VALID_NIVEAUX = ['DEBUTANT', 'QUELQUES_MOIS', 'PLUS_D_UN_AN', 'INTERMEDIAIRE'];
const VALID_EQUIPEMENTS = ['SALLE_COMPLETE', 'SALLE_BASIQUE'];
const VALID_STATUS = ['DRAFT', 'COACH_REVIEW', 'VALIDATED', 'PUBLISHED', 'RETIRED'];
const VALID_SLOT_GRADES = ['PRIMARY', 'ALTERNATE', 'OPTIONAL'];
const VALID_SLOT_ROLES = ['WARMUP', 'MAIN', 'ACCESSORY', 'COOLDOWN', 'FINISHER'];
const VALID_METRICS = ['REPS', 'TIME', 'DISTANCE', 'CALORIES'];
const VALID_FORMATS = ['STANDARD', 'CIRCUIT', 'SUPERSET', 'EMOM', 'AMRAP'];

// ─────────────────────────── CHECKSUM ────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 checksum of a manifest.
 * The `checksum` field itself is excluded to avoid circularity.
 * The `status` field is also excluded so that forcing to DRAFT does not change the checksum.
 */
export function computeChecksum(manifest: ProgramManifest): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { checksum: _c, status: _s, ...rest } = manifest;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─────────────────────────── VALIDATORS ──────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// ─────────────────────────── MAIN EXPORT ─────────────────────────────────────

/**
 * Validate a raw (possibly untrusted) input against the ProgramManifest schema.
 * Returns a `ValidationReport` with all issues found and the computed checksum.
 */
export function validateProgramManifest(input: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];

  // ── Type guard ─────────────────────────────────────────────────────────────
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    issues.push({ code: 'INVALID_TYPE', message: 'Manifest must be a non-null object', severity: 'error' });
    return { valid: false, checksum: '', issues };
  }

  const m = input as Record<string, unknown>;

  // ── Required string fields ─────────────────────────────────────────────────
  const requiredStrings: Array<[string, string[]]> = [
    ['versionCode', []],
    ['nom', []],
    ['objectif', VALID_OBJECTIFS],
    ['niveauMin', VALID_NIVEAUX],
    ['niveauMax', VALID_NIVEAUX],
    ['typeEquipement', VALID_EQUIPEMENTS],
  ];

  for (const [field, allowed] of requiredStrings) {
    if (!isNonEmptyString(m[field])) {
      issues.push({ code: `MISSING_FIELD`, message: `Field "${field}" is required and must be a non-empty string`, path: field, severity: 'error' });
    } else if (allowed.length > 0 && !allowed.includes(m[field] as string)) {
      issues.push({ code: `INVALID_ENUM`, message: `"${field}" must be one of: ${allowed.join(', ')}`, path: field, severity: 'error' });
    }
  }

  // ── Optional status ────────────────────────────────────────────────────────
  if (m['status'] !== undefined && !VALID_STATUS.includes(m['status'] as string)) {
    issues.push({ code: 'INVALID_STATUS', message: `"status" must be one of: ${VALID_STATUS.join(', ')}`, path: 'status', severity: 'error' });
  }

  // ── Required number fields ─────────────────────────────────────────────────
  for (const field of ['seancesParSemaine', 'dureeSeanceMin', 'nbSemaines']) {
    if (!isPositiveInt(m[field])) {
      issues.push({ code: 'MISSING_FIELD', message: `Field "${field}" must be a positive integer`, path: field, severity: 'error' });
    }
  }

  // ── Blueprints ─────────────────────────────────────────────────────────────
  if (!Array.isArray(m['blueprints']) || (m['blueprints'] as unknown[]).length === 0) {
    issues.push({ code: 'MISSING_BLUEPRINTS', message: 'Manifest must have at least one blueprint', path: 'blueprints', severity: 'error' });
  } else {
    const blueprintCodes = new Set<string>();
    for (let bi = 0; bi < (m['blueprints'] as unknown[]).length; bi++) {
      const bp = (m['blueprints'] as unknown[])[bi] as Record<string, unknown>;
      const bPath = `blueprints[${bi}]`;
      if (!isNonEmptyString(bp?.['blueprintCode'])) {
        issues.push({ code: 'MISSING_FIELD', message: `blueprintCode is required`, path: `${bPath}.blueprintCode`, severity: 'error' });
      } else {
        if (blueprintCodes.has(bp['blueprintCode'] as string)) {
          issues.push({ code: 'DUPLICATE_BLUEPRINT_CODE', message: `Duplicate blueprintCode: ${bp['blueprintCode']}`, path: `${bPath}.blueprintCode`, severity: 'error' });
        }
        blueprintCodes.add(bp['blueprintCode'] as string);
      }
      if (!isNonEmptyString(bp?.['nom'])) {
        issues.push({ code: 'MISSING_FIELD', message: `Blueprint nom is required`, path: `${bPath}.nom`, severity: 'error' });
      }
      if (bp?.['sessionFormat'] !== undefined && !VALID_FORMATS.includes(bp['sessionFormat'] as string)) {
        issues.push({ code: 'INVALID_ENUM', message: `sessionFormat must be one of: ${VALID_FORMATS.join(', ')}`, path: `${bPath}.sessionFormat`, severity: 'error' });
      }
      // ── Slots ────────────────────────────────────────────────────────────────
      if (!Array.isArray(bp?.['slots'])) {
        issues.push({ code: 'MISSING_FIELD', message: `Blueprint must have slots array`, path: `${bPath}.slots`, severity: 'error' });
      } else {
        for (let si = 0; si < (bp['slots'] as unknown[]).length; si++) {
          const slot = (bp['slots'] as unknown[])[si] as Record<string, unknown>;
          const sPath = `${bPath}.slots[${si}]`;
          if (!isNonEmptyString(slot?.['slotCode'])) {
            issues.push({ code: 'MISSING_FIELD', message: `slotCode is required`, path: `${sPath}.slotCode`, severity: 'error' });
          }
          if (!isPositiveInt(slot?.['nbSeries'])) {
            issues.push({ code: 'MISSING_FIELD', message: `nbSeries must be a positive integer`, path: `${sPath}.nbSeries`, severity: 'error' });
          }
          if (slot?.['slotRole'] !== undefined && !VALID_SLOT_ROLES.includes(slot['slotRole'] as string)) {
            issues.push({ code: 'INVALID_ENUM', message: `slotRole must be one of: ${VALID_SLOT_ROLES.join(', ')}`, path: `${sPath}.slotRole`, severity: 'error' });
          }
          if (slot?.['metric'] !== undefined && !VALID_METRICS.includes(slot['metric'] as string)) {
            issues.push({ code: 'INVALID_ENUM', message: `metric must be one of: ${VALID_METRICS.join(', ')}`, path: `${sPath}.metric`, severity: 'error' });
          }
          // Options
          if (!Array.isArray(slot?.['options'])) {
            issues.push({ code: 'MISSING_FIELD', message: `Slot must have options array`, path: `${sPath}.options`, severity: 'warning' });
          } else {
            for (let oi = 0; oi < (slot['options'] as unknown[]).length; oi++) {
              const opt = (slot['options'] as unknown[])[oi] as Record<string, unknown>;
              const oPath = `${sPath}.options[${oi}]`;
              if (!isNonEmptyString(opt?.['exerciseId'])) {
                issues.push({ code: 'MISSING_FIELD', message: `exerciseId is required`, path: `${oPath}.exerciseId`, severity: 'error' });
              }
              if (!VALID_SLOT_GRADES.includes(opt?.['grade'] as string)) {
                issues.push({ code: 'INVALID_ENUM', message: `grade must be one of: ${VALID_SLOT_GRADES.join(', ')}`, path: `${oPath}.grade`, severity: 'error' });
              }
            }
          }
        }
      }
    }
  }

  // ── Weeks ──────────────────────────────────────────────────────────────────
  if (!Array.isArray(m['weeks']) || (m['weeks'] as unknown[]).length === 0) {
    issues.push({ code: 'MISSING_WEEKS', message: 'Manifest must have at least one week', path: 'weeks', severity: 'error' });
  } else {
    for (let wi = 0; wi < (m['weeks'] as unknown[]).length; wi++) {
      const week = (m['weeks'] as unknown[])[wi] as Record<string, unknown>;
      const wPath = `weeks[${wi}]`;
      if (!isPositiveInt(week?.['numero'])) {
        issues.push({ code: 'MISSING_FIELD', message: `Week numero must be a positive integer`, path: `${wPath}.numero`, severity: 'error' });
      }
      if (!Array.isArray(week?.['occurrences'])) {
        issues.push({ code: 'MISSING_FIELD', message: `Week must have occurrences array`, path: `${wPath}.occurrences`, severity: 'error' });
      }
    }
  }

  // ── Compute checksum (even if validation failed — useful for debugging) ────
  let checksum = '';
  try {
    checksum = computeChecksum(input as ProgramManifest);
  } catch {
    // ignore
  }

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    valid: !hasErrors,
    checksum,
    issues,
    manifest: hasErrors ? undefined : (input as ProgramManifest),
  };
}
