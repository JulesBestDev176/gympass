import { IsString, IsInt, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  userId: string; // ID du GymbroUser

  @IsDateString()
  dateExpiration: string; // ISO date

  @IsInt()
  @Min(0)
  montantFcfa: number;

  @IsOptional()
  @IsString()
  note?: string;
}
