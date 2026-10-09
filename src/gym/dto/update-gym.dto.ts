import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateGymDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() ville?: string;
}

export class UpdatePricingDto {
  @IsOptional() @IsInt() @Min(0) fraisInscription?: number;
  @IsOptional() @IsInt() @Min(0) prixMensualite?: number;
  @IsOptional() @IsInt() @Min(1) dureeMensualite?: number;
  @IsOptional() @IsInt() @Min(0) prixSeance?: number;
  @IsOptional() @IsInt() @Min(1) antiDoubleScanSec?: number;
}
