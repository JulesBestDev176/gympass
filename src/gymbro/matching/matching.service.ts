import { ExercisesService } from '../exercises/exercises.service';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { matchPrograms, UserProfileInput } from './matching.engine';
import { V3_PROGRAM_PENDING_REASON, flattenV3 } from '../questionnaire/questionnaire-v3';
import { matchProgram, RULES_VERSION, type PublishedVersion, type V3NormalizedProfile } from './matching-engine-v2';

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService, private readonly exercises: ExercisesService) {}

  async run(userId: string) {
    const profile = await this.prisma.gymbroUserProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil introuvable');
    if (!profile.questionnaireComplet) {
      throw new BadRequestException('Questionnaire non complété');
    }
    if (profile.questionnaireV3) {
      // ── V3 matching path ─────────────────────────────────────────────────────
      const flat = flattenV3(profile.questionnaireV3);

      const normalizedProfile: V3NormalizedProfile = {
        userId,
        safetyStatus: flat.safetyStatus,
        trainingLevel: flat.trainingLevel,
        primaryGoal: flat.primaryGoal,
        sessionsPerWeek: flat.sessionsPerWeek ?? null,
        primaryTrainingLocation: flat.primaryTrainingLocation,
        trainingLocations: flat.trainingLocations,
        availableEquipment: flat.availableEquipment ?? [],
        maxSessionMinutes: flat.sessionDurationMinutes ?? null,
      };

      // Load all PUBLISHED versions
      const publishedPrograms = await this.prisma.gymbroProgram.findMany({
        where: { editorialStatus: 'PUBLISHED' },
        select: {
          id: true,
          versionCode: true,
          seancesParSemaine: true,
          family: { select: { familyCode: true, goalCoverage: true, prescriptionPolicy: true, progressionPolicy: true, maxSessionMinutes: true } },
          maxSessionMinutes: true,
          prescriptionPolicy: true,
          progressionPolicy: true,
        },
      });

      const publishedVersions: PublishedVersion[] = publishedPrograms
        .filter(p => p.versionCode && p.family)
        .map(p => ({
          id: p.id,
          versionCode: p.versionCode!,
          familyCode: p.family!.familyCode,
          goalCoverage: p.family!.goalCoverage,
          sessionsPerWeek: p.seancesParSemaine,
          maxSessionMinutes: p.maxSessionMinutes ?? p.family!.maxSessionMinutes,
          prescriptionPolicy: p.prescriptionPolicy ?? p.family!.prescriptionPolicy,
          progressionPolicy: p.progressionPolicy ?? p.family!.progressionPolicy,
        }));

      const decision = matchProgram(normalizedProfile, publishedVersions);

      // Find the latest profile snapshot for this user
      const snapshot = await (this.prisma as any).gymbroProfileSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (snapshot) {
        await (this.prisma as any).gymbroMatchingDecision.create({
          data: {
            profileSnapshotId: snapshot.id,
            status: decision.status,
            score: decision.score,
            versionCode: decision.versionCode,
            reasonCodesJson: decision.reasonCodes,
            rulesVersion: decision.rulesVersion,
          },
        });
      }

      return decision;
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
    if (profile.questionnaireV3) {
      if (!profile.questionnaireComplet) {
        return { matched: false, reason: 'Complète et valide ton questionnaire avant de choisir un programme.' };
      }
      // Return latest matching decision if available
      const snapshot = await (this.prisma as any).gymbroProfileSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (snapshot) {
        const latestDecision = await (this.prisma as any).gymbroMatchingDecision.findFirst({
          where: { profileSnapshotId: snapshot.id },
          orderBy: { decidedAt: 'desc' },
        });
        if (latestDecision) {
          return {
            status: latestDecision.status,
            score: latestDecision.score,
            versionCode: latestDecision.versionCode,
            reasonCodes: latestDecision.reasonCodesJson,
            rulesVersion: latestDecision.rulesVersion,
          };
        }
      }
      return { matched: false, reason: V3_PROGRAM_PENDING_REASON };
    }

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
                      include: { exercise: { select: { nomFr: true, groupeMusculaire: true, photoExerciceUrl: true, actif: true, mediaSource: true, mediaSourceId: true, mediaSourceRevision: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return { matched: true, program: this.exercises.publishedProgram(program) };
  }
}
