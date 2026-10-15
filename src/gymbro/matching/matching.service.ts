import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { matchPrograms, UserProfileInput } from './matching.engine';

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async run(userId: string) {
    const profile = await this.prisma.gymbroUserProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil introuvable');
    if (!profile.questionnaireComplet) {
      throw new BadRequestException('Questionnaire non complété');
    }

    // Charger les programmes actifs
    const programs = await this.prisma.gymbroProgram.findMany({ where: { actif: true } });

    if (!profile.objectifPrincipal || !profile.niveauExperience || !profile.typeEquipement || !profile.seancesParSemaine) {
      await this.prisma.gymbroUserProfile.update({
        where: { userId },
        data: { matchingStatus: 'NO_MATCH' },
      });
      return { matched: false, reason: 'Profil incomplet pour le matching' };
    }

    const input: UserProfileInput = {
      objectifPrincipal: profile.objectifPrincipal,
      niveauExperience: profile.niveauExperience,
      typeEquipement: profile.typeEquipement,
      seancesParSemaine: profile.seancesParSemaine,
      dureeMaxSeanceMin: profile.dureeMaxSeanceMin ?? 90,
      preferenceEquipement: profile.preferenceEquipement,
    };

    const results = matchPrograms(input, programs);

    if (results.length === 0) {
      await this.prisma.gymbroUserProfile.update({
        where: { userId },
        data: { matchingStatus: 'NO_MATCH' },
      });
      return { matched: false, reason: 'Aucun programme ne correspond à votre profil pour le moment.' };
    }

    const best = results[0].program;

    await this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: { matchingStatus: 'MATCHED', matchingProgramId: best.id },
    });

    return {
      matched: true,
      programId: best.id,
      score: results[0].score,
      alternatives: results.slice(1, 3).map((r) => ({ programId: r.program.id, score: r.score })),
    };
  }

  async getResult(userId: string) {
    const profile = await this.prisma.gymbroUserProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil introuvable');

    if (profile.matchingStatus === 'NO_MATCH') {
      return { matched: false, reason: 'Aucun programme disponible pour votre profil.' };
    }

    if (profile.matchingStatus !== 'MATCHED' || !profile.matchingProgramId) {
      return { matched: false, reason: 'Matching en cours ou questionnaire non complété.' };
    }

    const program = await this.prisma.gymbroProgram.findUnique({
      where: { id: profile.matchingProgramId },
      include: {
        phases: {
          take: 1,
          include: {
            weeks: {
              take: 1,
              include: {
                sessions: {
                  include: {
                    exercises: {
                      take: 3,
                      orderBy: { ordre: 'asc' },
                      include: { exercise: { select: { nomFr: true, groupeMusculaire: true, photoExerciceUrl: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return { matched: true, program };
  }
}
