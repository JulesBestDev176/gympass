import { IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class GymbroInitRegisterDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;

  @IsString()
  @MinLength(2)
  prenom: string;

  @IsString()
  @MinLength(2)
  nom: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class GymbroConfirmOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code OTP invalide (6 chiffres)' })
  otpCode: string;
}

// Keep for backward compat (admin-created users via GymDash)
export class GymbroRegisterDto {
  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  prenom: string;

  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  telephone?: string;
}
