import { IsInt, IsOptional, IsBoolean, IsArray, Min, Max } from 'class-validator';

export class QuestionnaireStep3Dto {
  @IsInt()
  @Min(2, { message: 'Minimum 2 jours d\'entraînement par semaine' })
  @Max(6, { message: 'Maximum 6 jours — la récupération est indispensable' })
  seancesParSemaine: number;

  @IsInt()
  dureeMaxSeanceMin: number; // 60 | 75 | 90

  @IsOptional()
  @IsArray()
  joursPreferesJson?: string[]; // ["lun","mar","ven"]

  @IsOptional()
  @IsBoolean()
  changementPrevu?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  seancesApresChangement?: number;
}
