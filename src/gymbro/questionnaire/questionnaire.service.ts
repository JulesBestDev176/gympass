import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { flattenV3, validateV3Step } from './questionnaire-v3';
import { PrismaService } from '../../prisma/prisma.service';
import { QuestionnaireStep1Dto } from './dto/step1.dto';
import { QuestionnaireStep2Dto } from './dto/step2.dto';
import { QuestionnaireStep3Dto } from './dto/step3.dto';
import { QuestionnaireStep4Dto } from './dto/step4.dto';
import { QuestionnaireStep5Dto } from './dto/step5.dto';
import { QuestionnaireStep6Dto } from './dto/step6.dto';

@Injectable()
export class QuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  private async getProfile(userId: string) {
    const profile = await this.prisma.gymbroUserProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil introuvable');
    return profile;
  }

  async getMyProfile(userId: string) {
    const profile = await this.getProfile(userId);
    if (!profile.questionnaireV3) return profile;
    return {
      ...profile, ...flattenV3(profile.questionnaireV3),
      questionnaireSchemaVersion: 'gymbro-questionnaire/3',
      currentStep: profile.etapeActuelle, isComplete: profile.questionnaireComplet,
    };
  }

  async saveV3Step(userId: string, step: number, input: unknown) {
    const data = validateV3Step(step, input);
    // One atomic JSONB merge prevents parallel saves of different steps from
    // overwriting each other. Each step is replaced so removed answers disappear.
    const patch = JSON.stringify({[`step${step}`]: data});
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE "gymbro_user_profiles"
      SET "questionnaireV3" = COALESCE("questionnaireV3", '{}'::jsonb) || ${patch}::jsonb,
          "etapeActuelle" = GREATEST("etapeActuelle", ${step + 1}),
          "questionnaireComplet" = false, "matchingStatus" = 'PENDING',
          "matchingProgramId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
      RETURNING "id"
    `;
    if (!rows.length) throw new NotFoundException('Profil introuvable');
    return {saved: true, step, questionnaireSchemaVersion: 'gymbro-questionnaire/3'};
  }

  async validateV3(userId: string) {
    const profile = await this.getProfile(userId);
    const stored = profile.questionnaireV3 as Record<string, any> | null;
    for (let step = 1; step <= 8; step++) {
      if (!stored?.[`step${step}`]) throw new BadRequestException(`Complète l’étape ${step} avant de créer ton programme.`);
      validateV3Step(step, stored[`step${step}`]);
    }
    const data = flattenV3(stored);
    if (data.safetyStatus === 'NEEDSMEDICALREVIEW') {
      throw new BadRequestException('La section santé nécessite un avis professionnel avant de créer un programme.');
    }
    const result = await this.prisma.gymbroUserProfile.updateMany({
      where: {userId, updatedAt: profile.updatedAt},
      data: {questionnaireComplet: true, etapeActuelle: 9, matchingStatus: 'NO_MATCH', matchingProgramId: null},
    });
    if (result.count !== 1) throw new ConflictException('Tes réponses ont changé. Vérifie-les et réessaie.');
    return {isComplete: true, questionnaireSchemaVersion: 'gymbro-questionnaire/3', programStatus: 'CATALOG_PENDING'};
  }

  async saveStep1(userId: string, dto: QuestionnaireStep1Dto) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireComplet) {
      throw new BadRequestException('Questionnaire déjà complété. Utilisez la modification.');
    }
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        objectifPrincipal: dto.objectifPrincipal,
        objectifSecondaire: dto.objectifSecondaire ?? null,
        descriptionPhysique: dto.descriptionPhysique ?? null,
        etapeActuelle: Math.max(profile.etapeActuelle, 2),
      },
    });
  }

  async saveStep2(userId: string, dto: QuestionnaireStep2Dto) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireComplet) throw new BadRequestException('Questionnaire déjà complété.');
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        age: dto.age,
        tailleCm: dto.tailleCm,
        poidsKg: dto.poidsKg,
        poidsSouhaiteKg: dto.poidsSouhaiteKg ?? null,
        etapeActuelle: Math.max(profile.etapeActuelle, 3),
      },
    });
  }

  async saveStep3(userId: string, dto: QuestionnaireStep3Dto) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireComplet) throw new BadRequestException('Questionnaire déjà complété.');
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        seancesParSemaine: dto.seancesParSemaine,
        dureeMaxSeanceMin: dto.dureeMaxSeanceMin,
        joursPreferesJson: dto.joursPreferesJson ? JSON.stringify(dto.joursPreferesJson) : null,
        changementPrevu: dto.changementPrevu ?? false,
        seancesApresChangement: dto.seancesApresChangement ?? null,
        etapeActuelle: Math.max(profile.etapeActuelle, 4),
      },
    });
  }

  async saveStep4(userId: string, dto: QuestionnaireStep4Dto) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireComplet) throw new BadRequestException('Questionnaire déjà complété.');
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        niveauExperience: dto.niveauExperience,
        typeEquipement: dto.typeEquipement,
        preferenceEquipement: dto.preferenceEquipement,
        etapeActuelle: Math.max(profile.etapeActuelle, 5),
      },
    });
  }

  async saveStep5(userId: string, dto: QuestionnaireStep5Dto) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireComplet) throw new BadRequestException('Questionnaire déjà complété.');
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        performancesJson: dto.performancesJson ? JSON.stringify(dto.performancesJson) : null,
        allerEchec: dto.allerEchec ?? null,
        etapeActuelle: Math.max(profile.etapeActuelle, 6),
      },
    });
  }

  async saveStep6(userId: string, dto: QuestionnaireStep6Dto) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireComplet) throw new BadRequestException('Questionnaire déjà complété.');
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        douleurs: dto.douleurs ?? null,
        blessures: dto.blessures ?? null,
        heuresSommeil: dto.heuresSommeil ?? null,
        niveauFatigue: dto.niveauFatigue ?? null,
        restrictionMedicale: dto.restrictionMedicale ?? false,
        etapeActuelle: 7,
      },
    });
  }

  async submit(userId: string) {
    const profile = await this.getProfile(userId);
    if (profile.questionnaireV3) return this.validateV3(userId);

    // Vérifier que les étapes obligatoires sont remplies
    const missingFields: string[] = [];
    if (!profile.objectifPrincipal) missingFields.push('objectifPrincipal (étape 1)');
    if (!profile.age || !profile.tailleCm || !profile.poidsKg) missingFields.push('profil physique (étape 2)');
    if (!profile.seancesParSemaine) missingFields.push('disponibilités (étape 3)');
    if (!profile.niveauExperience || !profile.typeEquipement) missingFields.push('niveau & matériel (étape 4)');

    if (missingFields.length > 0) {
      throw new BadRequestException(`Étapes incomplètes : ${missingFields.join(', ')}`);
    }

    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data: {
        questionnaireComplet: true,
        matchingStatus: 'PENDING',
      },
    });
    // Le matching sera déclenché par le module matching
  }

  async updateField(userId: string, data: Record<string, any>) {
    await this.getProfile(userId);
    return this.prisma.gymbroUserProfile.update({
      where: { userId },
      data,
    });
  }
}
