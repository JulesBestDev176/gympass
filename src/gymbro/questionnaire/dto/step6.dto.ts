import { IsOptional, IsBoolean, IsString, IsNumber, IsInt, Min, Max } from 'class-validator';

export class QuestionnaireStep6Dto {
  @IsOptional()
  @IsString()
  douleurs?: string;

  @IsOptional()
  @IsString()
  blessures?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(12)
  heuresSommeil?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  niveauFatigue?: number;

  @IsOptional()
  @IsBoolean()
  restrictionMedicale?: boolean;
}
