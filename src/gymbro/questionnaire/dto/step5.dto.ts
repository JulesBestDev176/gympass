import { IsOptional, IsBoolean, IsArray } from 'class-validator';

export class QuestionnaireStep5Dto {
  @IsOptional()
  @IsArray()
  performancesJson?: Array<{
    exercice: string;
    charge: number;
    series: number;
    reps: number;
    typeCharge: 'total' | 'par_cote' | 'par_haltere' | 'machine';
  }>;

  @IsOptional()
  @IsBoolean()
  allerEchec?: boolean;
}
