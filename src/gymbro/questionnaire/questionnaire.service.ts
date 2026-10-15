import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
    return this.getProfile(userId);
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
