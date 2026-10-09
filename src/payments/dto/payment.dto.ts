import { IsString, IsInt, IsEnum, IsOptional, Min } from 'class-validator';
import { PaymentMode, PaymentType } from '@prisma/client';

export class CreatePaymentDto {
  @IsString() memberId: string;

  @IsEnum(PaymentType) type: PaymentType;

  // RECHARGE_CARTE uniquement
  @IsOptional() @IsString() sessionCardId?: string;
  @IsOptional() @IsInt() @Min(1) nbSeances?: number;

  @IsEnum(PaymentMode) mode: PaymentMode;

  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;

  // ABONNEMENT uniquement — montant peut être custom
  @IsOptional() @IsInt() @Min(0) montantOverride?: number;
}
