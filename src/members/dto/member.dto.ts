import { IsString, IsOptional, IsPhoneNumber } from 'class-validator';

export class CreateMemberDto {
  @IsString() nom: string;
  @IsString() prenom: string;
  @IsString() telephone: string;
  @IsOptional() @IsString() photoUrl?: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsString() photoUrl?: string;
}
