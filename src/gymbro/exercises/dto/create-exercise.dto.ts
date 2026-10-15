import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateExerciseDto {
  @IsString()
  nomFr: string;

  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @IsOptional()
  @IsString()
  instructionsFrJson?: string; // JSON string

  @IsString()
  groupeMusculaire: string;

  @IsString()
  musclesPrimairesJson: string; // JSON string

  @IsOptional()
  @IsString()
  musclesSecondairesJson?: string;

  @IsString()
  equipementRequis: string;

  @IsOptional()
  @IsString()
  difficulte?: string;

  @IsOptional()
  @IsString()
  photoExerciceUrl?: string;

  @IsOptional()
  @IsString()
  photoMuscleUrl?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
