import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { validateProgramManifest } from './contracts/program-manifest.schema';
import type { ProgramManifest, ValidationReport, ValidationIssue, EditorialStatus } from './contracts/program-contracts';

// ─────────────────────────── ALLOWED TRANSITIONS ─────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, EditorialStatus[]> = {
  DRAFT: ['COACH_REVIEW', 'RETIRED'],
  COACH_REVIEW: ['VALIDATED', 'DRAFT', 'RETIRED'],
  VALIDATED: ['PUBLISHED', 'COACH_REVIEW', 'RETIRED'],
  PUBLISHED: ['RETIRED'],
  RETIRED: [],
};

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ProgramImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ── validate (DB-based structural check, for admin UI) ──────────────────────

  async validate(programId: string): Promise<ValidationReport> {
    const program = await (this.prisma as any).gymbroProgram.findUnique({
      where: { id: programId },
      include: {
        phases: { include: { weeks: { include: { sessions: { include: { exercises: { include: { exercise: true } } } } } } } },
      },
    });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);
    const issues: ValidationIssue[] = [];
    let weekCount = 0;
    for (const phase of program.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        weekCount++;
        if (!week.sessions?.length) issues.push({ code: 'EMPTY_WEEK', path: `weeks.${week.numero}`, message: `Semaine ${week.numero} vide` });
        for (const session of week.sessions ?? []) {
          if (!session.exercises?.length) issues.push({ code: 'EMPTY_SESSION', path: `weeks.${week.numero}`, message: `Séance "${session.nom}" vide` });
          for (const link of session.exercises ?? []) {
            if (!link.exercise?.actif) issues.push({ code: 'INACTIVE_EXERCISE', path: `weeks.${week.numero}`, message: `Exercice inactif dans "${session.nom}"` });
            if (!link.exercise?.mediaSource) issues.push({ code: 'MISSING_MEDIA', path: `weeks.${week.numero}`, message: `Animation à vérifier dans "${session.nom}"` });
          }
        }
      }
    }
    if (weekCount < (program.nbSemaines ?? 12)) issues.push({ code: 'MISSING_WEEKS', path: 'weeks', message: `${weekCount}/${program.nbSemaines} semaines trouvées` });
    return { valid: issues.length === 0, issues, checksum: program.checksum ?? '' };
  }

  // ── dryRun ──────────────────────────────────────────────────────────────────

  async dryRun(manifest: ProgramManifest): Promise<ValidationReport> {
    return validateProgramManifest(manifest);
  }

  // ── importDraft ─────────────────────────────────────────────────────────────

  async importDraft(manifest: ProgramManifest): Promise<{ id: string; created: boolean }> {
    const report = validateProgramManifest(manifest);
    if (!report.valid) {
      const messages = report.issues.map((i) => i.message).join('; ');
      throw new BadRequestException(`Manifest validation failed: ${messages}`);
    }

    // Force status to DRAFT
    const safeManifest: ProgramManifest = { ...manifest, status: 'DRAFT' };
    const checksum = report.checksum;

    return this.prisma.$transaction(async (tx) => {
      const txAny = tx as any;

      // Upsert family
      const family = await txAny.gymbroProgramFamily.upsert({
        where: { familyCode: safeManifest.familyCode },
        create: {
          familyCode: safeManifest.familyCode,
          goalCoverage: safeManifest.goalCoverage,
          prescriptionPolicy: safeManifest.prescriptionPolicy,
          progressionPolicy: safeManifest.progressionPolicy,
          maxSessionMinutes: safeManifest.maxSessionMinutes,
        },
        update: {
          goalCoverage: safeManifest.goalCoverage,
          prescriptionPolicy: safeManifest.prescriptionPolicy,
          progressionPolicy: safeManifest.progressionPolicy,
          maxSessionMinutes: safeManifest.maxSessionMinutes,
        },
      });

      // Check for existing program by versionCode
      const existing = await txAny.gymbroProgram.findUnique({
        where: { versionCode: safeManifest.versionCode },
        select: { id: true, checksum: true, editorialStatus: true },
      });

      if (existing) {
        if (existing.checksum === checksum) {
          return { id: existing.id, created: false };
        }
        if (existing.editorialStatus === 'PUBLISHED') {
          throw new ConflictException('Checksum conflict: published version is immutable');
        }
        await txAny.gymbroProgram.update({
          where: { id: existing.id },
          data: buildProgramData(safeManifest, checksum, family.id),
        });
        await rebuildWeekStructure(txAny, existing.id, safeManifest);
        return { id: existing.id, created: false };
      }

      const created = await txAny.gymbroProgram.create({
        data: buildProgramData(safeManifest, checksum, family.id),
      });
      await rebuildWeekStructure(txAny, created.id, safeManifest);
      return { id: created.id, created: true };
    });
  }

  // ── transition ──────────────────────────────────────────────────────────────

  async transition(
    programId: string,
    target: EditorialStatus,
    actorId: string,
    expectedChecksum: string,
  ): Promise<void> {
    const program = await (this.prisma as any).gymbroProgram.findUnique({
      where: { id: programId },
      select: { id: true, checksum: true, editorialStatus: true },
    });

    if (!program) throw new NotFoundException(`Program ${programId} not found`);
    if (program.checksum !== expectedChecksum) {
      throw new ConflictException('Checksum mismatch: the program has been modified');
    }

    const current: EditorialStatus = program.editorialStatus ?? 'DRAFT';
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];

    if (!allowed.includes(target)) {
      if (current === 'PUBLISHED' && target !== 'RETIRED') {
        throw new ForbiddenException('PUBLISHED programs can only be RETIRED');
      }
      throw new BadRequestException(`Transition from ${current} to ${target} is not allowed`);
    }

    const now = new Date();
    const update: Record<string, unknown> = { editorialStatus: target };
    if (target === 'COACH_REVIEW' || target === 'VALIDATED') {
      update['reviewedAt'] = now;
      update['reviewAuthor'] = actorId;
    }
    if (target === 'PUBLISHED') {
      update['publishedAt'] = now;
      update['reviewedAt'] = now;
      update['reviewAuthor'] = actorId;
    }

    await (this.prisma as any).gymbroProgram.update({
      where: { id: programId },
      data: update,
    });
  }
}

// ─────────────────────────── HELPERS ─────────────────────────────────────────

function buildProgramData(
  manifest: ProgramManifest,
  checksum: string,
  familyId: string,
): Record<string, unknown> {
  return {
    nom: manifest.versionCode,          // versionCode as stable display name
    objectif: 'REMISE_EN_FORME',        // default; matching engine picks the right one
    niveauMin: 'DEBUTANT',
    niveauMax: 'INTERMEDIAIRE',
    seancesParSemaine: manifest.weeks[0]?.sessions.length ?? 3,
    dureeSeanceMin: manifest.maxSessionMinutes,
    nbSemaines: manifest.durationWeeks,
    versionCode: manifest.versionCode,
    editorialStatus: 'DRAFT',
    checksum,
    familyId,
    prescriptionPolicy: manifest.prescriptionPolicy ?? null,
    progressionPolicy: manifest.progressionPolicy ?? null,
    maxSessionMinutes: manifest.maxSessionMinutes ?? null,
    actif: false,
  };
}

async function rebuildWeekStructure(
  tx: any,
  programId: string,
  manifest: ProgramManifest,
): Promise<void> {
  // Clean up existing phase/week/session/exercise structure
  const existingPhases = await tx.gymbroProgramPhase.findMany({
    where: { programId },
    select: { id: true },
  });
  for (const phase of existingPhases) {
    const weeks = await tx.gymbroProgramWeek.findMany({
      where: { phaseId: phase.id },
      select: { id: true },
    });
    for (const week of weeks) {
      const sessions = await tx.gymbroProgramSession.findMany({
        where: { weekId: week.id },
        select: { id: true },
      });
      for (const session of sessions) {
        await tx.gymbroSessionExercise.deleteMany({ where: { sessionId: session.id } });
      }
      await tx.gymbroProgramSession.deleteMany({ where: { weekId: week.id } });
    }
    await tx.gymbroProgramWeek.deleteMany({ where: { phaseId: phase.id } });
  }
  await tx.gymbroProgramPhase.deleteMany({ where: { programId } });

  // Phases derived from phaseNumber in weeks (1..3)
  const phaseNumbers = [...new Set(manifest.weeks.map((w) => w.phaseNumber))].sort();
  const phaseIdMap = new Map<number, string>();
  for (const phaseNum of phaseNumbers) {
    const phase = await tx.gymbroProgramPhase.create({
      data: { programId, numero: phaseNum, nom: `Phase ${phaseNum}` },
    });
    phaseIdMap.set(phaseNum, phase.id);
  }

  for (const week of manifest.weeks) {
    const phaseId = phaseIdMap.get(week.phaseNumber)!;
    const dbWeek = await tx.gymbroProgramWeek.create({
      data: { phaseId, numero: week.weekNumber, estDecharge: false },
    });

    for (const session of week.sessions) {
      const dbSession = await tx.gymbroProgramSession.create({
        data: {
          weekId: dbWeek.id,
          numero: session.sessionNumber,
          nom: session.occurrenceCode,
          blueprintCode: session.blueprintCode,
          occurrenceCode: session.occurrenceCode,
          sessionFormat: session.format ?? 'STANDARD',
          rounds: session.rounds ?? null,
          betweenExerciseRestSec: session.betweenExerciseRestSeconds ?? null,
          betweenRoundRestSec: session.betweenRoundRestSeconds ?? null,
          estimatedSeconds: session.estimatedSeconds ?? null,
        },
      });

      // Slot exercise rows are created at assignment time (Task 9), not at catalog import.
      // The session structure (blueprintCode, occurrenceCode, format) is sufficient for DRAFT.
    }
  }
}
