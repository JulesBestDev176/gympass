import { IsEmail, IsString } from 'class-validator';

export class GymbroLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
