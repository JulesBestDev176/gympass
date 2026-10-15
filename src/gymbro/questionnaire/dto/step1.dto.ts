import { IsEnum, IsOptional, IsString } from 'class-validator';
import { GymbroObjectif } from '@prisma/client';

export class QuestionnaireStep1Dto {
  @IsEnum(GymbroObjectif)
  objectifPrincipal: GymbroObjectif;

  @IsOptional()
  @IsEnum(GymbroObjectif)
  objectifSecondaire?: GymbroObjectif;

  @IsOptional()
  @IsString()
  descriptionPhysique?: string;
}
