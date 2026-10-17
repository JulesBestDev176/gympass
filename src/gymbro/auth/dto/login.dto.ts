import { IsString, Matches } from 'class-validator';

export class GymbroLoginDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;

  @IsString()
  password: string;
}
