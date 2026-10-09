import { IsString, IsOptional } from 'class-validator';

export class ScanDto {
  @IsString() qrCode: string;
}

export class ExceptionalEntryDto {
  @IsString() memberId: string;
  @IsOptional() @IsString() motif?: string;
}
