import { IsString, IsInt, IsEnum, IsOptional, IsUUID, Min, Max, Matches } from 'class-validator';
import { PaymentMode, PaymentType } from '@prisma/client';

export class CreatePaymentDto {
  @IsOptional() @IsUUID() requestId?: string;
  @IsString() memberId: string;

  @IsEnum(PaymentType) type: PaymentType;

  // RECHARGE_CARTE uniquement
  @IsOptional() @IsString() sessionCardId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) nbSeances?: number;

  @IsEnum(PaymentMode) mode: PaymentMode;

  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;

  // ABONNEMENT uniquement — montant peut être custom
  @IsOptional() @IsInt() @Min(0) montantOverride?: number;

  // ABONNEMENT uniquement — mois couvert par la mensualité
  @IsOptional() @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Format attendu : YYYY-MM' })
  moisCouvert?: string;
}
