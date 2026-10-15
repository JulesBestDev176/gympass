import { IsString, IsOptional, IsInt, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class StartSessionDto {
  @IsString()
  programSessionId: string; // ID de la GymbroProgramSession à réaliser

  @IsString()
  userProgramId: string;
}

export class RecordSetDto {
  @IsString()
  sessionExerciseId: string;

  @IsInt()
  @Min(1)
  numeroSerie: number;

  @IsOptional()
  @IsNumber()
  chargeAcceptee?: number;

  @IsOptional()
  @IsNumber()
  chargeRealisee?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  repsRealisees?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulte?: number; // RPE subjectif 1–5

  @IsOptional()
  @IsBoolean()
  douleur?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteSessionDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
