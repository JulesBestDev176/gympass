import { ExercisesService } from '../exercises/exercises.service';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StartSessionDto, RecordSetDto, CompleteSessionDto } from './dto/session.dto';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService, private readonly exercises: ExercisesService) {}

  // ── Démarrer une séance ───────────────────────────────────────────────────

  async start(userId: string, dto: StartSessionDto) {
    // Vérifier que le userProgram appartient à cet utilisateur
    const userProgram = await this.prisma.gymbroUserProgram.findFirst({
      where: { id: dto.userProgramId, userId },
    });
    if (!userProgram) throw new NotFoundException('Programme utilisateur introuvable');

    // Vérifier si une séance est déjà en cours
    const inProgress = await this.prisma.gymbroUserSession.findFirst({
      where: { userProgramId: dto.userProgramId, statut: 'IN_PROGRESS' },
    });
    if (inProgress) {
      throw new BadRequestException('Une séance est déjà en cours. Terminez-la avant d\'en commencer une nouvelle.');
    }

    const session = await this.prisma.gymbroUserSession.create({
      data: {
        userProgramId: dto.userProgramId,
        programSessionId: dto.programSessionId,
        statut: 'IN_PROGRESS',
        dateDebut: new Date(),
      },
      include: {
        programSession: {
          include: {
            exercises: {
              orderBy: { ordre: 'asc' },
              include: { exercise: true },
            },
          },
        },
      },
    });

    // Pré-calculer les charges proposées pour chaque exercice
    const exercisesWithProposedLoad = await Promise.all(
      session.programSession.exercises.filter(se => se.exercise.actif).map(async (se) => {
        const chargeProposee = await this.calculateProposedLoad(userId, se);
        return { ...se, chargeProposee };
      }),
    );

    return { ...session, programSession: this.exercises.publishedSession({ ...session.programSession, exercises: exercisesWithProposedLoad }) };
  }

  // Calcule la charge proposée basée sur l'historique
  private async calculateProposedLoad(userId: string, sessionExercise: any): Promise<number | null> {
    // Chercher la dernière série réussie pour cet exercice
    const lastSet = await this.prisma.gymbroUserSet.findFirst({
      where: {
        sessionExerciseId: sessionExercise.id,
        statut: 'COMPLETED',
        chargeRealisee: { not: null },
        userSession: { userProgram: { userId } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastSet?.chargeRealisee) {
      return sessionExercise.chargeDepart ?? null;
    }

    // Vérifier si la progression est méritée (toutes les séries au max des reps)
    const lastSessionSets = await this.prisma.gymbroUserSet.findMany({
      where: {
        sessionExerciseId: sessionExercise.id,
        userSession: { userProgram: { userId } },
        statut: 'COMPLETED',
        createdAt: { gte: new Date(lastSet.createdAt.getTime() - 3600000) }, // même séance
      },
    });

    const allAtMax = lastSessionSets.every(
      (s) => s.repsRealisees !== null && s.repsRealisees >= sessionExercise.repsMax,
    );

    return allAtMax
      ? lastSet.chargeRealisee + 2.5
      : lastSet.chargeRealisee;
  }

  // ── Enregistrer une série ─────────────────────────────────────────────────

  async recordSet(userId: string, sessionId: string, dto: RecordSetDto) {
    const session = await this.prisma.gymbroUserSession.findFirst({
      where: { id: sessionId, userProgram: { userId }, statut: 'IN_PROGRESS' },
    });
    if (!session) throw new NotFoundException('Séance en cours introuvable');

    // Upsert : mettre à jour si la série existe déjà, sinon créer
    const existing = await this.prisma.gymbroUserSet.findFirst({
      where: {
        userSessionId: sessionId,
        sessionExerciseId: dto.sessionExerciseId,
        numeroSerie: dto.numeroSerie,
      },
    });

    const data = {
      userSessionId: sessionId,
      sessionExerciseId: dto.sessionExerciseId,
      numeroSerie: dto.numeroSerie,
      chargeAcceptee: dto.chargeAcceptee ?? null,
      chargeRealisee: dto.chargeRealisee ?? null,
      repsRealisees: dto.repsRealisees ?? null,
      difficulte: dto.difficulte ?? null,
      douleur: dto.douleur ?? false,
      notes: dto.notes ?? null,
      statut: 'COMPLETED' as const,
    };

    if (existing) {
      return this.prisma.gymbroUserSet.update({ where: { id: existing.id }, data });
    }
    return this.prisma.gymbroUserSet.create({ data });
  }

  // ── Terminer une séance ───────────────────────────────────────────────────

  async complete(userId: string, sessionId: string, dto: CompleteSessionDto) {
    const session = await this.prisma.gymbroUserSession.findFirst({
      where: { id: sessionId, userProgram: { userId }, statut: 'IN_PROGRESS' },
      include: { sets: true },
    });
    if (!session) throw new NotFoundException('Séance en cours introuvable');

    const volumeTotal = session.sets.reduce(
      (acc, s) => acc + (s.chargeRealisee ?? 0) * (s.repsRealisees ?? 0),
      0,
    );

    return this.prisma.gymbroUserSession.update({
      where: { id: sessionId },
      data: {
        statut: 'COMPLETED',
        dateFin: new Date(),
        notes: dto.notes ?? null,
      },
    });
  }

  // ── Sauter une séance ─────────────────────────────────────────────────────

  async skip(userId: string, sessionId: string) {
    const session = await this.prisma.gymbroUserSession.findFirst({
      where: { id: sessionId, userProgram: { userId } },
    });
    if (!session) throw new NotFoundException('Séance introuvable');
    return this.prisma.gymbroUserSession.update({
      where: { id: sessionId },
      data: { statut: 'SKIPPED' },
    });
  }

  // ── Récupérer une séance ──────────────────────────────────────────────────

  async findOne(userId: string, sessionId: string) {
    const session = await this.prisma.gymbroUserSession.findFirst({
      where: { id: sessionId, userProgram: { userId } },
      include: {
        sets: { orderBy: [{ sessionExerciseId: 'asc' }, { numeroSerie: 'asc' }] },
        programSession: {
          include: {
            exercises: {
              orderBy: { ordre: 'asc' },
              include: { exercise: true },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Séance introuvable');
    return { ...session, programSession: this.exercises.publishedSession(session.programSession) };
  }

  // Séance du jour (prochaine non complétée)
  async today(userId: string, userProgramId: string) {
    const session = await this.prisma.gymbroUserSession.findFirst({
      where: {
        userProgramId,
        userProgram: { userId },
        statut: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        programSession: {
          include: {
            exercises: {
              orderBy: { ordre: 'asc' },
              include: { exercise: true },
            },
          },
        },
      },
    });
    return session ? { ...session, programSession: this.exercises.publishedSession(session.programSession) } : null;
  }

  async reportDifficulty(userId: string, sessionId: string, notes: string) {
    const session = await this.prisma.gymbroUserSession.findFirst({
      where: { id: sessionId, userProgram: { userId } },
    });
    if (!session) throw new NotFoundException();
    return this.prisma.gymbroUserSession.update({
      where: { id: sessionId },
      data: { notes: [session.notes, `[DIFFICULTÉ] ${notes}`].filter(Boolean).join('\n') },
    });
  }
}
