import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { validateProgramManifest } from './contracts/program-manifest.schema';
import type { ProgramManifest, ValidationReport, EditorialStatus } from './contracts/program-contracts';

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

  // ── dryRun ──────────────────────────────────────────────────────────────────
  // Validate the manifest without writing anything to the DB.
  // Returns the ValidationReport (with checksum).

  async dryRun(manifest: ProgramManifest): Promise<ValidationReport> {
    return validateProgramManifest(manifest);
  }

  // ── importDraft ─────────────────────────────────────────────────────────────
  // Transactionally import a manifest as DRAFT.
  //   - Idempotent: same versionCode + same checksum → returns {id, created: false}
  //   - PUBLISHED + different checksum → throws ConflictException (409)
  //   - non-PUBLISHED + same versionCode → update fields, {id, created: false}
  //   - new versionCode → create, {id, created: true}

  async importDraft(manifest: ProgramManifest): Promise<{ id: string; created: boolean }> {
    // 1. Validate
    const report = validateProgramManifest(manifest);
    if (!report.valid) {
      const messages = report.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ');
      throw new BadRequestException(`Manifest validation failed: ${messages}`);
    }

    // 2. Force status to DRAFT
    manifest = { ...manifest, status: 'DRAFT' };
    const checksum = report.checksum;

    // 3. All inside a single transaction
    return this.prisma.$transaction(async (tx) => {
      // ── Upsert family ──────────────────────────────────────────────────────
      let familyId: string | undefined;
      if (manifest.family?.familyCode) {
        const family = await (tx as any).gymbroProgramFamily.upsert({
          where: { familyCode: manifest.family.familyCode },
          create: {
            familyCode: manifest.family.familyCode,
            goalCoverage: manifest.family.goalCoverage ?? [],
            prescriptionPolicy: manifest.family.prescriptionPolicy,
            progressionPolicy: manifest.family.progressionPolicy,
            maxSessionMinutes: manifest.family.maxSessionMinutes,
          },
          update: {
            goalCoverage: manifest.family.goalCoverage ?? [],
            prescriptionPolicy: manifest.family.prescriptionPolicy,
            progressionPolicy: manifest.family.progressionPolicy,
            maxSessionMinutes: manifest.family.maxSessionMinutes,
          },
        });
        familyId = family.id;
      }

      // ── Check existing program ─────────────────────────────────────────────
      const existing = await (tx as any).gymbroProgram.findUnique({
        where: { versionCode: manifest.versionCode },
        select: { id: true, checksum: true, editorialStatus: true },
      });

      if (existing) {
        // Idempotent: same checksum → nothing to do
        if (existing.checksum === checksum) {
          return { id: existing.id, created: false };
        }

        // Published + different checksum → conflict
        if (existing.editorialStatus === 'PUBLISHED') {
          throw new ConflictException('Checksum conflict: published version is immutable');
        }

        // Not published + different checksum → update
        const programData = buildProgramData(manifest, checksum, familyId);
        await (tx as any).gymbroProgram.update({
          where: { id: existing.id },
          data: programData,
        });

        // Re-create week structure
        await deleteAndRecreateWeekStructure(tx, existing.id, manifest);

        return { id: existing.id, created: false };
      }

      // ── Create new program ─────────────────────────────────────────────────
      const programData = buildProgramData(manifest, checksum, familyId);
      const created = await (tx as any).gymbroProgram.create({ data: programData });

      // Create week structure
      await deleteAndRecreateWeekStructure(tx, created.id, manifest);

      return { id: created.id, created: true };
    });
  }

  // ── transition ──────────────────────────────────────────────────────────────
  // Apply an editorial status transition with optimistic locking on checksum.

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

    if (!program) {
      throw new NotFoundException(`Program ${programId} not found`);
    }

    // Optimistic lock — checksum must match
    if (program.checksum !== expectedChecksum) {
      throw new ConflictException('Checksum mismatch: the program has been modified');
    }

    const current: EditorialStatus = program.editorialStatus ?? 'DRAFT';
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];

    if (!allowed.includes(target)) {
      if (current === 'PUBLISHED' && target !== 'RETIRED') {
        throw new ForbiddenException(`PUBLISHED programs can only be RETIRED`);
      }
      throw new BadRequestException(`Transition from ${current} to ${target} is not allowed`);
    }

    // Build update payload
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
  familyId: string | undefined,
): Record<string, unknown> {
  return {
    nom: manifest.nom,
    description: manifest.description,
    objectif: manifest.objectif,
    niveauMin: manifest.niveauMin,
    niveauMax: manifest.niveauMax,
    seancesParSemaine: manifest.seancesParSemaine,
    typeEquipement: manifest.typeEquipement,
    dureeSeanceMin: manifest.dureeSeanceMin,
    nbSemaines: manifest.nbSemaines,
    versionCode: manifest.versionCode,
    editorialStatus: 'DRAFT',
    checksum,
    familyId: familyId ?? null,
    prescriptionPolicy: manifest.prescriptionPolicy ?? null,
    progressionPolicy: manifest.progressionPolicy ?? null,
    maxSessionMinutes: manifest.maxSessionMinutes ?? null,
    actif: false, // drafts are not yet active
  };
}

async function deleteAndRecreateWeekStructure(
  tx: unknown,
  programId: string,
  manifest: ProgramManifest,
): Promise<void> {
  const txClient = tx as any;

  // Find all existing phases for this program (legacy structure)
  // and cascade-delete them to clean up old week structure via phases
  const existingPhases = await txClient.gymbroProgramPhase.findMany({
    where: { programId },
    select: { id: true },
  });

  // Also delete any orphan weeks that reference this program directly (new structure)
  // We need to find weeks linked to phases of this program
  for (const phase of existingPhases) {
    const weeks = await txClient.gymbroProgramWeek.findMany({
      where: { phaseId: phase.id },
      select: { id: true },
    });
    for (const week of weeks) {
      const sessions = await txClient.gymbroProgramSession.findMany({
        where: { weekId: week.id },
        select: { id: true },
      });
      for (const session of sessions) {
        await txClient.gymbroSessionExercise.deleteMany({ where: { sessionId: session.id } });
      }
      await txClient.gymbroProgramSession.deleteMany({ where: { weekId: week.id } });
    }
    await txClient.gymbroProgramWeek.deleteMany({ where: { phaseId: phase.id } });
  }
  await txClient.gymbroProgramPhase.deleteMany({ where: { programId } });

  // Build a blueprint lookup map
  const blueprintMap = new Map(manifest.blueprints.map((bp) => [bp.blueprintCode, bp]));

  // Create a single "virtual" phase to hold all weeks (backward-compatible with existing structure)
  const phase = await txClient.gymbroProgramPhase.create({
    data: {
      programId,
      numero: 1,
      nom: 'Programme principal',
      description: 'Generated from manifest',
    },
  });

  // Create weeks → occurrences (sessions) → slots (exercises)
  for (const week of manifest.weeks) {
    const dbWeek = await txClient.gymbroProgramWeek.create({
      data: {
        phaseId: phase.id,
        numero: week.numero,
        estDecharge: week.estDecharge ?? false,
      },
    });

    for (const occ of week.occurrences) {
      const blueprint = blueprintMap.get(occ.blueprintCode);
      if (!blueprint) continue; // skip unknown blueprint references

      const dbSession = await txClient.gymbroProgramSession.create({
        data: {
          weekId: dbWeek.id,
          numero: occ.numero,
          nom: blueprint.nom,
          description: blueprint.description,
          // New fields — set if the model supports them (graceful with any schema version)
          ...(blueprint.blueprintCode !== undefined ? { blueprintCode: blueprint.blueprintCode } : {}),
          ...(occ.occurrenceCode !== undefined ? { occurrenceCode: occ.occurrenceCode } : {}),
          ...(blueprint.sessionFormat !== undefined ? { sessionFormat: blueprint.sessionFormat } : {}),
          ...(blueprint.rounds !== undefined ? { rounds: blueprint.rounds } : {}),
        },
      });

      // Create slot exercises
      for (const slot of blueprint.slots) {
        // Skip slots with no approved options (no binding)
        const approvedOptions = slot.options.filter((o) => o.approved);
        if (approvedOptions.length === 0) continue;

        // Use the first approved PRIMARY option as the "main" exercise
        const primaryOption =
          approvedOptions.find((o) => o.grade === 'PRIMARY') ?? approvedOptions[0];

        const exerciseData: Record<string, unknown> = {
          sessionId: dbSession.id,
          exerciseId: primaryOption.exerciseId,
          ordre: slot.ordre,
          nbSeries: slot.nbSeries,
          repsMin: slot.repsMin ?? 0,
          repsMax: slot.repsMax ?? 0,
          tempsReposSec: slot.tempsReposSec ?? 90,
          notes: slot.notes,
        };

        // New optional fields — only include if the model supports them
        if (slot.slotCode !== undefined) exerciseData['slotCode'] = slot.slotCode;
        if (slot.slotRole !== undefined) exerciseData['slotRole'] = slot.slotRole;
        if (slot.metric !== undefined) exerciseData['metric'] = slot.metric;
        if (slot.workingSets !== undefined) exerciseData['workingSets'] = slot.workingSets;
        if (slot.repsMin2 !== undefined) exerciseData['repsMin2'] = slot.repsMin2;
        if (slot.repsMax2 !== undefined) exerciseData['repsMax2'] = slot.repsMax2;

        await txClient.gymbroSessionExercise.create({ data: exerciseData });
      }
    }
  }
}
