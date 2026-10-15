import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class GymbroRegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  prenom: string;

  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  telephone?: string;
}
