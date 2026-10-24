import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class FinancesQuery {
  @IsOptional() @IsIn(['month', 'week', 'all', 'custom']) period: string = 'month';
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) start?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) end?: string;
  @IsOptional() @IsIn(['all', 'PAYMENT', 'BRACELET', 'SHOP']) source: string = 'all';
  @IsOptional() @IsIn(['all', 'ABONNEMENT', 'INSCRIPTION', 'RECHARGE_CARTE', 'SEANCE_UNIQUE', 'BRACELET', 'SHOP']) type: string = 'all';
  @IsOptional() @IsIn(['all', 'ESPECES', 'WAVE', 'ORANGE_MONEY', 'CHEQUE', 'VIREMENT', 'AUTRE', 'UNKNOWN']) mode: string = 'all';
  @IsOptional() @IsIn(['newest', 'oldest', 'highest', 'lowest']) sort: string = 'newest';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString({ strict: true }) snapshot?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000000) offset: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
}
