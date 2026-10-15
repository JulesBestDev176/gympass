import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GymbroObjectif, GymbroNiveau, GymbroTypeEquipement } from '@prisma/client';

export class CreateExerciseSetDto {
  @IsString()
  exerciseId: string;

  @IsInt()
  @Min(1)
  ordre: number;

  @IsInt()
  @Min(1)
  nbSeries: number;

  @IsInt()
  @Min(1)
  repsMin: number;

  @IsInt()
  @Min(1)
  repsMax: number;

  @IsOptional()
  @IsInt()
  tempsReposSec?: number;

  @IsOptional()
  chargeDepart?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSessionDto {
  @IsInt()
  @Min(1)
  numero: number;

  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExerciseSetDto)
  exercises: CreateExerciseSetDto[];
}

export class CreateWeekDto {
  @IsInt()
  @Min(1)
  numero: number;

  @IsOptional()
  @IsBoolean()
  estDecharge?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSessionDto)
  sessions: CreateSessionDto[];
}

export class CreatePhaseDto {
  @IsInt()
  @Min(1)
  numero: number;

  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWeekDto)
  weeks: CreateWeekDto[];
}

export class CreateProgramDto {
  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(GymbroObjectif)
  objectif: GymbroObjectif;

  @IsEnum(GymbroNiveau)
  niveauMin: GymbroNiveau;

  @IsEnum(GymbroNiveau)
  niveauMax: GymbroNiveau;

  @IsInt()
  @Min(2)
  @Max(6)
  seancesParSemaine: number;

  @IsEnum(GymbroTypeEquipement)
  typeEquipement: GymbroTypeEquipement;

  @IsInt()
  @Min(30)
  @Max(180)
  dureeSeanceMin: number;

  @IsOptional()
  @IsInt()
  nbSemaines?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePhaseDto)
  phases?: CreatePhaseDto[];
}
