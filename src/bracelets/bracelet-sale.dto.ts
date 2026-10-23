import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class BraceletLookupDto {
  @IsString() qrCode: string;
}

export class CreateBraceletSaleDto {
  @IsUUID() requestId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) qrCodes: string[];
  @IsOptional() @IsIn(['ESPECES', 'WAVE', 'ORANGE_MONEY']) mode?: PaymentMode;
  @IsInt() @Min(0) expectedUnitPrice: number;
}
