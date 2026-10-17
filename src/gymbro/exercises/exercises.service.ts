import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { ExerciseCatalogService } from './exercise-catalog.service';

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService, private readonly catalog: ExerciseCatalogService) {}

  private enrich(ex: any) {
    const item = ex.mediaSource === 'flow' && this.catalog?.lookup(ex.mediaSourceId, ex.mediaSourceRevision);
    return { ...ex, animationUrl: item?.animationUrl ?? null, animationPosterUrl: item?.posterUrl ?? null,
      animationLicense: item?.hasAnimation ? item.license : null };
  }

  async findAll(actif?: boolean) {
    const rows = await this.prisma.gymbroExercise.findMany({
      where: actif !== undefined ? { actif } : {}, orderBy: [{ groupeMusculaire: 'asc' }, { nomFr: 'asc' }],
    });
    return rows.map(ex => this.enrich(ex));
  }

  async findOne(id: string, publishedOnly = true) {
    const ex = await this.prisma.gymbroExercise.findUnique({ where: { id } });
    if (!ex || (publishedOnly && !ex.actif)) throw new NotFoundException('Exercice introuvable');
    return this.enrich(ex);
  }

  private editable(dto: Partial<CreateExerciseDto>, creating = false) {
    const data: any = {};
    const limits = { nomFr: 200, descriptionFr: 10000, instructionsFrJson: 20000, groupeMusculaire: 100,
      musclesPrimairesJson: 5000, musclesSecondairesJson: 5000, equipementRequis: 200, difficulte: 100,
      photoExerciceUrl: 2000, photoMuscleUrl: 2000 };
    for (const [key, max] of Object.entries(limits)) {
      if (dto[key] === undefined) continue;
      if (['descriptionFr', 'difficulte', 'photoExerciceUrl', 'photoMuscleUrl'].includes(key) && (dto[key] === null || (typeof dto[key] === 'string' && !dto[key].trim()))) { data[key] = null; continue; }
      if (typeof dto[key] !== 'string' || dto[key].length > max || !dto[key].trim()) throw new BadRequestException(`Champ invalide: ${key}`);
      data[key] = dto[key].trim();
    }
    for (const key of ['instructionsFrJson', 'musclesPrimairesJson', 'musclesSecondairesJson']) {
      if (data[key] === undefined) continue;
      let value: unknown;
      try { value = JSON.parse(data[key]); } catch { throw new BadRequestException(`JSON invalide: ${key}`); }
      if (!Array.isArray(value) || value.length > 100 || !value.every(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000)) throw new BadRequestException(`Liste de textes requise: ${key}`);
      data[key] = JSON.stringify(value);
    }
    if (creating) for (const key of ['nomFr', 'groupeMusculaire', 'musclesPrimairesJson', 'equipementRequis']) {
      if (!data[key]) throw new BadRequestException(`Champ requis: ${key}`);
    }
    return data;
  }

  async create(dto: CreateExerciseDto) {
    return this.enrich(await this.prisma.gymbroExercise.create({ data: { ...this.editable(dto, true), actif: false } }));
  }

  async update(id: string, dto: Partial<CreateExerciseDto>) {
    await this.findOne(id, false);
    const data = this.editable(dto);
    // Changed movement/instructions must be reviewed again before publication.
    if (Object.keys(data).length) Object.assign(data, { actif: false, animationReviewedAt: null });
    return this.enrich(await this.prisma.gymbroExercise.update({ where: { id }, data }));
  }

  async toggle(id: string, reviewed?: boolean, expectedUpdatedAt?: string) {
    const ex = await this.findOne(id, false);
    if (!ex.actif && (reviewed !== true || !ex.animationUrl)) throw new BadRequestException('Une animation disponible et une confirmation de vérification sont requises');
    if (!ex.actif && (!expectedUpdatedAt || new Date(expectedUpdatedAt).getTime() !== new Date(ex.updatedAt).getTime())) {
      throw new ConflictException('Exercice modifié entre-temps : rechargez et vérifiez à nouveau');
    }
    try {
      return this.enrich(await this.prisma.gymbroExercise.update({
        where: { id, updatedAt: ex.updatedAt, actif: ex.actif },
        data: { actif: !ex.actif, ...(!ex.actif ? { animationReviewedAt: new Date() } : {}) },
      }));
    } catch (error) {
      if (error.code === 'P2025') throw new ConflictException('Exercice modifié entre-temps : rechargez et vérifiez à nouveau');
      throw error;
    }
  }

  publishedSession(session: any) {
    if (!session) return session;
    return { ...session, exercises: (session.exercises || []).filter(link => link.exercise?.actif === true)
      .map(link => ({ ...link, exercise: this.enrich(link.exercise) })) };
  }

  publishedProgram(program: any) {
    if (!program) return program;
    return { ...program, phases: (program.phases || []).map(phase => ({ ...phase,
      weeks: (phase.weeks || []).map(week => ({ ...week,
        sessions: (week.sessions || []).map(session => this.publishedSession(session)),
      })),
    })) };
  }

  async browseCatalog(query: Record<string, string>) {
    const result = this.catalog.browse(query);
    const imported = await this.prisma.gymbroExercise.findMany({ where: { mediaSource: 'flow' }, select: { id: true, mediaSourceId: true } });
    const ids = new Map(imported.map(ex => [ex.mediaSourceId, ex.id]));
    return { ...result, items: result.items.map(item => ({ ...item, importedExerciseId: ids.get(item.sourceId) ?? null })) };
  }

  async importExercise(sourceId: string, nomFr?: string) {
    const item = this.catalog.requireItem(sourceId);
    const where = { mediaSource_mediaSourceId: { mediaSource: 'flow', mediaSourceId: sourceId } };
    const existing = await this.prisma.gymbroExercise.findUnique({ where });
    if (existing) return this.enrich(existing);
    const data = { ...this.editable({ nomFr: nomFr ?? item.nameOriginal, groupeMusculaire: item.groupeMusculaire,
      instructionsFrJson: JSON.stringify(item.instructionsFr), musclesPrimairesJson: JSON.stringify(item.musclesPrimaires),
      musclesSecondairesJson: JSON.stringify(item.musclesSecondaires), equipementRequis: item.equipementRequis }, true),
      actif: false, mediaSource: 'flow', mediaSourceId: sourceId, mediaSourceRevision: item.sourceRevision, animationReviewedAt: null };
    try { return this.enrich(await this.prisma.gymbroExercise.create({ data })); }
    catch (error) {
      if (error.code !== 'P2002') throw error;
      const concurrent = await this.prisma.gymbroExercise.findUnique({ where });
      if (!concurrent) throw error;
      return this.enrich(concurrent);
    }
  }

  async attachSource(id: string, sourceId: string) {
    await this.findOne(id, false);
    const item = this.catalog.requireItem(sourceId);
    try {
      return this.enrich(await this.prisma.gymbroExercise.update({ where: { id }, data: {
        mediaSource: 'flow', mediaSourceId: sourceId, mediaSourceRevision: item.sourceRevision, animationReviewedAt: null, actif: false,
      } }));
    } catch (error) {
      if (error.code === 'P2002') throw new ConflictException('Cette source est déjà liée à un exercice');
      throw error;
    }
  }
}
