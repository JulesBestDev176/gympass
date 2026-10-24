import { IsString, Length, Matches } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @Length(1, 100)
  gym: string;

  @IsString()
  @Length(1, 100)
  city: string;

  @IsString()
  @Matches(/^[+0-9 ()\-]{9,20}$/)
  phone: string;
}
