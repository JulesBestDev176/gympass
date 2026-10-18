import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class GymbroPasswordForgotDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  telephone: string;
}

export class GymbroPasswordResetDto extends GymbroPasswordForgotDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otpCode: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
