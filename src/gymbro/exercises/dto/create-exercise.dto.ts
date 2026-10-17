import { IsString, IsOptional, IsBoolean, Length, MaxLength, Matches } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateExerciseDto {
  @IsString() @Length(1, 200) nomFr: string;
  @IsOptional() @IsString() @MaxLength(10000) descriptionFr?: string;
  @IsOptional() @IsString() @MaxLength(20000) instructionsFrJson?: string;
  @IsString() @Length(1, 100) groupeMusculaire: string;
  @IsString() @MaxLength(5000) musclesPrimairesJson: string;
  @IsOptional() @IsString() @MaxLength(5000) musclesSecondairesJson?: string;
  @IsString() @Length(1, 200) equipementRequis: string;
  @IsOptional() @IsString() @MaxLength(100) difficulte?: string;
  @IsOptional() @IsString() @MaxLength(2000) photoExerciceUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) photoMuscleUrl?: string;
  // Accepted for compatibility; publication is exclusively controlled by review/toggle.
  @IsOptional() @IsBoolean() actif?: boolean;
}
export class UpdateExerciseDto extends PartialType(CreateExerciseDto) {}
export class AttachSourceDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,160}$/) sourceId: string;
}
export class ImportExerciseDto extends AttachSourceDto {
  @IsOptional() @IsString() @Length(1, 200) nomFr?: string;
}
export class ReviewExerciseDto {
  @IsOptional() @IsBoolean() reviewed?: boolean;
}
