import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // Historique des charges pour un exercice
  async getExerciseHistory(userId: string, exerciseId: string) {
    const sets = await this.prisma.gymbroUserSet.findMany({
      where: {
        statut: 'COMPLETED',
        chargeRealisee: { not: null },
        sessionExercise: { exerciseId },
        userSession: { userProgram: { userId }, statut: 'COMPLETED' },
      },
      select: {
        chargeRealisee: true,
        repsRealisees: true,
        numeroSerie: true,
        createdAt: true,
        userSession: { select: { dateDebut: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Grouper par séance
    const bySession = sets.reduce<Record<string, any[]>>((acc, s) => {
      const date = s.userSession.dateDebut?.toISOString().split('T')[0] ?? s.createdAt.toISOString().split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(s);
      return acc;
    }, {});

    return Object.entries(bySession).map(([date, sessionSets]) => ({
      date,
      chargeMax: Math.max(...sessionSets.map((s) => s.chargeRealisee ?? 0)),
      sets: sessionSets,
    }));
  }

  // Vue d'ensemble progression
  async getOverview(userId: string, userProgramId: string) {
    const [totalSessions, completedSessions, skippedSessions] = await Promise.all([
      this.prisma.gymbroUserSession.count({ where: { userProgramId, userProgram: { userId } } }),
      this.prisma.gymbroUserSession.count({ where: { userProgramId, userProgram: { userId }, statut: 'COMPLETED' } }),
      this.prisma.gymbroUserSession.count({ where: { userProgramId, userProgram: { userId }, statut: 'SKIPPED' } }),
    ]);

    const volumeResult = await this.prisma.gymbroUserSet.aggregate({
      where: {
        statut: 'COMPLETED',
        userSession: { userProgramId, userProgram: { userId } },
        chargeRealisee: { not: null },
        repsRealisees: { not: null },
      },
      _sum: { chargeRealisee: true },
    });

    return {
      totalSessions,
      completedSessions,
      skippedSessions,
      completionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
      volumeTotalKg: volumeResult._sum.chargeRealisee ?? 0,
    };
  }

  // Logs de poids
  async addWeightLog(userId: string, poidsKg: number, note?: string) {
    return this.prisma.gymbroWeightLog.create({
      data: { userId, poidsKg, note },
    });
  }

  async getWeightLogs(userId: string) {
    return this.prisma.gymbroWeightLog.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
    });
  }

  // Photos de progression
  async addPhoto(userId: string, url: string, angle: 'FACE' | 'PROFIL' | 'DOS') {
    return this.prisma.gymbroPhoto.create({ data: { userId, url, angle } });
  }

  async getPhotos(userId: string) {
    return this.prisma.gymbroPhoto.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
    });
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await this.prisma.gymbroPhoto.findFirst({ where: { id: photoId, userId } });
    if (!photo) throw new NotFoundException('Photo introuvable');
    return this.prisma.gymbroPhoto.delete({ where: { id: photoId } });
  }

  // Bilans
  async getBilans(userId: string) {
    return this.prisma.gymbroBilan.findMany({
      where: { userId },
      orderBy: { semaine: 'asc' },
    });
  }

  async getBilan(userId: string, bilanId: string) {
    const bilan = await this.prisma.gymbroBilan.findFirst({ where: { id: bilanId, userId } });
    if (!bilan) throw new NotFoundException('Bilan introuvable');
    return bilan;
  }

  // Générer bilan automatique (appelé par CRON toutes les 4 semaines)
  async generateBilan(userId: string, userProgramId: string, semaine: number) {
    const [sessions, lastWeight] = await Promise.all([
      this.prisma.gymbroUserSession.findMany({
        where: {
          userProgramId,
          userProgram: { userId },
          statut: { in: ['COMPLETED', 'SKIPPED'] },
        },
        include: { sets: true },
        orderBy: { datePrevue: 'asc' },
        take: semaine <= 4 ? 4 * 4 : semaine * 4, // approximation
      }),
      this.prisma.gymbroWeightLog.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
    ]);

    const completed = sessions.filter((s) => s.statut === 'COMPLETED');
    const volumeTotal = completed.flatMap((s) => s.sets).reduce(
      (acc, set) => acc + (set.chargeRealisee ?? 0) * (set.repsRealisees ?? 0),
      0,
    );

    return this.prisma.gymbroBilan.create({
      data: {
        userId,
        semaine,
        seancesTotal: sessions.length,
        seancesReussies: completed.length,
        volumeTotal,
        poidsFin: lastWeight?.poidsKg ?? null,
      },
    });
  }
}
