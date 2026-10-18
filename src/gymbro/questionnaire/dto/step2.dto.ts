import { IsInt, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class QuestionnaireStep2Dto {
  @IsInt()
  @Min(1)
  @Max(80)
  age: number;

  @IsInt()
  @Min(100)
  @Max(250)
  tailleCm: number;

  @IsNumber()
  @Min(30)
  @Max(300)
  poidsKg: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  poidsSouhaiteKg?: number;
}
