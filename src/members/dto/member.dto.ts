import { IsString, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/** Numéros Sénégal valides : 70 / 75 / 76 / 77 / 78 — 9 chiffres */
const SN_PHONE_REGEX = /^\+2217[05678]\d{7}$/;

/**
 * Normalise un numéro sénégalais vers E.164 (+221XXXXXXXXX).
 * Accepte : 77..., 077..., +22177..., 0022177..., 22177...
 * Supprime tous les espaces avant traitement.
 */
export function normalizeSenegalPhone(raw: string): string {
  let n = raw.replace(/\s+/g, '');
  if (n.startsWith('+221')) n = n.slice(4);
  else if (n.startsWith('00221')) n = n.slice(5);
  else if (n.startsWith('221')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  return `+221${n}`;
}

export class CreateMemberDto {
  @IsString() nom: string;
  @IsString() prenom: string;

  @Transform(({ value }) => normalizeSenegalPhone(value))
  @Matches(SN_PHONE_REGEX, {
    message: 'Numéro invalide. Format attendu : 7X XXX XX XX (opérateurs SN)',
  })
  telephone: string;

  @IsOptional() @IsString() photoUrl?: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? normalizeSenegalPhone(value) : value))
  @Matches(SN_PHONE_REGEX, {
    message: 'Numéro invalide. Format attendu : 7X XXX XX XX (opérateurs SN)',
  })
  telephone?: string;

  @IsOptional() @IsString() photoUrl?: string;
}
