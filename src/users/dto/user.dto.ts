import { IsString, IsOptional, IsEnum, IsBoolean, IsIn, MinLength, Matches, IsNotEmpty, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeSenegalPhone } from '../../members/dto/member.dto';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString() nom: string;
  @IsString() prenom: string;
  @Transform(({ value }) => typeof value === 'string' ? normalizeSenegalPhone(value) : value)
  @Matches(/^\+2217[05678]\d{7}$/, { message: 'Numéro WhatsApp sénégalais requis (7X XXX XX XX).' })
  telephone: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
}

export class UpdateUserDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? normalizeSenegalPhone(value) : value)
  @Matches(/^\+2217[05678]\d{7}$/, { message: 'Numéro WhatsApp sénégalais requis.' })
  telephone?: string;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() photoUrl?: string;
}

export class AdminCreateUserDto extends CreateUserDto {
  @IsString() @IsNotEmpty() gymId: string;
}

export class AdminStaffActionDto {
  @IsString() @IsNotEmpty() gymId: string;
}

export class AdminStaffContactDto extends AdminStaffActionDto {
  @IsString() @IsNotEmpty() telephone: string;
}

export class AdminUpdateUserDto {
  @IsString() gymId: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsIn(['ADMIN', 'GERANT']) role?: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsBoolean() actif?: boolean;
}
