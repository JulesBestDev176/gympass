import { IsEnum } from 'class-validator';
import { GymbroNiveau, GymbroTypeEquipement, GymbroPreferenceEquipement } from '@prisma/client';

export class QuestionnaireStep4Dto {
  @IsEnum(GymbroNiveau)
  niveauExperience: GymbroNiveau;

  @IsEnum(GymbroTypeEquipement)
  typeEquipement: GymbroTypeEquipement; // SALLE_COMPLETE | SALLE_BASIQUE uniquement

  @IsEnum(GymbroPreferenceEquipement)
  preferenceEquipement: GymbroPreferenceEquipement;
}
