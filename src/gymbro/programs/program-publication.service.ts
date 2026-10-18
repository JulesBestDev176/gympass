import type { ValidationReport } from './contracts/program-contracts';

/**
 * Returns the user-visible messages for all issues that block publication.
 * A manifest can only be published when this list is empty.
 */
export function getPublicationBlockers(report: ValidationReport): string[] {
  return report.issues.map((i) => i.message);
}
