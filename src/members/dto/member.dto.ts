import { IsString, IsOptional, Matches, IsEnum, ValidateNested, IsDefined, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentMode } from '@prisma/client';

/** Numéros Sénégal valides : 70 / 75 / 76 / 77 / 78 — 9 chiffres */
const SN_PHONE_REGEX = /^\+2217[05678]\d{7}$/;

/**
 * Normalise un numéro sénégalais vers E.164 (+221XXXXXXXXX).
 * Accepte : 77..., 077..., +22177..., 0022177..., 22177...
 * Supprime les espaces et séparateurs visuels avant traitement.
 */
export function normalizeSenegalPhone(raw: string): string {
  let n = raw.replace(/[\s().-]/g, '');
  if (n.startsWith('+221')) n = n.slice(4);
  else if (n.startsWith('00221')) n = n.slice(5);
  else if (n.startsWith('221')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return `+221${n}`;
}

export class CreateMemberPaiementDto {
  @IsEnum(PaymentMode) mode: PaymentMode;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
}

export class RegistrationFormulaDto {
  @IsIn(['MENSUEL', 'SEANCES']) type: 'MENSUEL' | 'SEANCES';
  @IsOptional() @IsInt() @Min(1) @Max(1000) nbSeances?: number;
}

export class CreateMemberDto {
  @IsOptional() @ValidateNested() @Type(() => RegistrationFormulaDto)
  formule?: RegistrationFormulaDto;

  @IsOptional() @IsInt() @Min(0) montantAttendu?: number;

  @IsOptional() @Matches(/^[a-f0-9]{32}$/)
  registrationRequestId?: string;

  @IsString() nom: string;
  @IsString() prenom: string;

  @Transform(({ value }) => typeof value === 'string' ? normalizeSenegalPhone(value) : value)
  @Matches(SN_PHONE_REGEX, {
    message: 'Numéro invalide. Format attendu : 7X XXX XX XX (opérateurs SN)',
  })
  telephone: string;

  @IsOptional() @IsString() photoUrl?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateMemberPaiementDto)
  paiement: CreateMemberPaiementDto;
}

export class UpdateMemberDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? normalizeSenegalPhone(value) : value)
  @Matches(SN_PHONE_REGEX, {
    message: 'Numéro invalide. Format attendu : 7X XXX XX XX (opérateurs SN)',
  })
  telephone?: string;

  @IsOptional() @IsString() photoUrl?: string;
}
